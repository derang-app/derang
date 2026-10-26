// High-quality cover images from the web: Taaghche's covers for (digital) books,
// BoardGameGeek's box art for games, and any image link (e.g. one ChatGPT found). A chosen
// image is downloaded once and stored on the phone like any photo.
//
// Taaghche's and BGG's image hosts don't allow a web app to read the pixels (no CORS), so downloads
// go through wsrv.nl, a free public image cache that adds the header and resizes on
// the way. Only the image address is sent to it.

export type CoverErrorCode = 'offline' | 'not_found' | 'bad_response';

export class CoverError extends Error {
  constructor(public code: CoverErrorCode) {
    super(code);
  }
}

export const COVER_ERROR_TEXT: Record<CoverErrorCode, string> = {
  offline: 'اتصال اینترنت برقرار نیست.',
  not_found: 'تصویری پیدا نشد.',
  bad_response: 'دریافت تصویر ممکن نشد. کمی بعد دوباره امتحان کن.',
};

/** Image address readable by the app: direct when the host allows it, else via wsrv.nl. */
export function readableImageUrl(url: string, max = 1600) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new CoverError('bad_response');
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${max}&h=${max}&fit=inside&we&output=jpg&q=90`;
}

/** An https address in pasted text (ChatGPT's answer may wrap it in a sentence or markdown). */
export function parseImageLink(text: string): string | undefined {
  const m = text.match(/https:\/\/[^\s<>"'()\[\]]+/i);
  if (!m) return undefined;
  const url = m[0].replace(/[.,;:!?،؛»]+$/, '');
  try {
    new URL(url);
    return url;
  } catch {
    return undefined;
  }
}

/** Download a chosen image. Rejects tiny placeholders (e.g. "no cover" images). */
export async function downloadImage(url: string, signal?: AbortSignal): Promise<Blob> {
  if (!navigator.onLine) throw new CoverError('offline');
  let res: Response;
  try {
    res = await fetch(readableImageUrl(url), { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new CoverError('offline');
  }
  if (res.status === 404) throw new CoverError('not_found');
  if (!res.ok) throw new CoverError('bad_response');
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') || blob.size > 20_000_000) throw new CoverError('bad_response');
  if (blob.size < 2_000) throw new CoverError('not_found');
  return blob;
}

// ---------- Taaghche ----------

/**
 * Book id from a Taaghche link, or from the text the Taaghche app shares (which wraps
 * the link in a sentence). Accepts Persian digits, since a pasted link may carry them.
 */
export function parseTaaghcheLink(text: string): string | undefined {
  const t = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const m = t.match(/taaghche\.(?:com|ir)\/(?:[\w-]+\/)?book\/(\d{1,9})(?!\d)/i);
  return m?.[1];
}

/** Taaghche's own front-cover image for a book (the publisher's cover, about 800×1170). */
export const taaghcheCoverUrl = (id: string) => `https://img.taaghche.com/frontCover/${id}.jpg`;

// ---------- ChatGPT prompt ----------

export interface PromptInfo {
  kind: 'book' | 'game';
  /** Name on my copy. */
  title: string;
  originalTitle?: string;
  authors?: string[];
  translators?: string[];
  publisher?: string;
  publication?: string;
  isbn?: string;
  /** Game: copy / redesign / original, as a plain English word. */
  edition?: string;
  refUrl?: string;
}

/**
 * A prompt for ChatGPT (which can search the web) asking it to find the real cover
 * image online and give its direct address, which is then pasted into the studio.
 * It isn't asked to draw the cover: a copy of a real cover is something it refuses.
 * In English for precise instructions; the book's own details stay in their script.
 */
export function coverPrompt(p: PromptInfo): string {
  const lines = (pairs: [string, string | undefined][]) =>
    pairs.filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  if (p.kind === 'book') {
    return `Help me find an image of the FRONT COVER of this exact book edition online, for my personal library app.

${lines([
  ['Title on my copy', p.title],
  ['Original title', p.originalTitle],
  ['Author', p.authors?.join(', ')],
  ['Translator', p.translators?.join(', ')],
  ['Publisher', p.publisher],
  ['Edition / year', p.publication],
  ['ISBN', p.isbn],
])}

Steps:
1. Search the web for this edition (same publisher and translator if given): bookstore and publisher pages such as Taaghche, Fidibo, Iranketab, or the publisher's own site.
2. Give me the DIRECT address of the cover image itself (a link that opens only the image, usually ending in .jpg, .png or .webp), the largest version available, plus the page you found it on.
3. Prefer a flat, front-on image of the cover over photos of the book or 3D mockups.

Don't create or edit any image; I only need the link. If you can only find a different edition, say so clearly. Answer in Persian, but keep the links exactly as they are.`;
  }
  return `Help me find an image of the FRONT OF THE BOX (the box lid) of this board game online, for my personal collection app.

${lines([
  ['Name on my copy', p.title],
  ['Original game', p.originalTitle],
  ['My copy is', p.edition],
  ['BoardGameGeek page', p.refUrl],
])}

Steps:
1. Search the web for this game's box art: BoardGameGeek, the publisher's site, or game stores.
2. Give me the DIRECT address of the box image itself (a link that opens only the image, usually ending in .jpg, .png or .webp), the largest version available, plus the page you found it on.
3. Prefer a flat, front-on image of the lid over photos of the box or 3D mockups.

Don't create or edit any image; I only need the link. If you can only find a different edition, say so clearly. Answer in Persian, but keep the links exactly as they are.`;
}

export const chatGptUrl = (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
