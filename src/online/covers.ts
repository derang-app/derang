// High-quality cover images from the web: Taaghche's covers for (digital) books,
// BoardGameGeek's box art for games, and images ChatGPT is asked to find. A chosen
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
 * A prompt for ChatGPT (which can search the web and make images) asking for a
 * faithful, flat, frame-filling cover image in the app's proportions. It's in English
 * because image models follow layout instructions more reliably in English; the book's
 * own details stay in their original script.
 */
export function coverPrompt(p: PromptInfo): string {
  const lines = (pairs: [string, string | undefined][]) =>
    pairs.filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  if (p.kind === 'book') {
    return `I need a clean, high-quality image of the FRONT COVER of this exact book edition for my personal library app.

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
1. Search the web for the real front cover of this edition (same publisher and translator if given). Tell me which source you found it on.
2. Create an image that reproduces that real cover faithfully: same artwork, colours and layout. Keep every piece of text exactly as printed; Persian text must be correct and right-to-left.

Image requirements:
- Portrait, 2:3 aspect ratio (1024×1536).
- The cover fills the entire frame edge to edge, flat and seen straight from the front.
- No perspective, no 3D book mockup, no spine, no shadow, no background, no hands, no watermark, no extra text.

If you can't find the real cover, say so instead of inventing one.`;
  }
  return `I need a clean, high-quality image of the FRONT OF THE BOX (the box lid) of this board game for my personal collection app.

${lines([
  ['Name on my copy', p.title],
  ['Original game', p.originalTitle],
  ['My copy is', p.edition],
  ['BoardGameGeek page', p.refUrl],
])}

Steps:
1. Search the web for the real box cover of this game (BoardGameGeek or the publisher's site). Tell me which source you used.
2. Create an image that reproduces that real box lid faithfully: same artwork, colours, logo and layout. Keep the text exactly as printed.

Image requirements:
- Square, 1:1 (1024×1024), unless the real box is clearly not square; then keep its true proportions.
- The lid fills the entire frame edge to edge, flat and seen straight from above.
- No perspective, no 3D box mockup, no box sides, no shadow, no table or background, no components, no watermark.

If you can't find the real box art, say so instead of inventing one.`;
}

export const chatGptUrl = (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
