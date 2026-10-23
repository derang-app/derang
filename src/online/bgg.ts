import { loadApiKey } from '../ai/secret';

// BoardGameGeek XML API2. Since 2025 every request needs a registered application's
// Bearer token. Each user registers their own (free, non-commercial) and it stays
// encrypted on their device, like the AI key. BGG answers CORS for browser apps, so
// requests go straight from the phone; there's no proxy (BGG's terms forbid one).

const BASE = 'https://boardgamegeek.com/xmlapi2';
export const BGG_SECRET = 'bgg';
export const BGG_APPLICATIONS_URL = 'https://boardgamegeek.com/applications';

export type BggErrorCode = 'not_configured' | 'offline' | 'auth' | 'busy' | 'not_found' | 'bad_response';

export class BggError extends Error {
  constructor(public code: BggErrorCode) {
    super(code);
  }
}

export const BGG_ERROR_TEXT: Record<BggErrorCode, string> = {
  not_configured: 'توکن BoardGameGeek تنظیم نشده است.',
  offline: 'اتصال اینترنت برقرار نیست.',
  auth: 'BGG توکن را نپذیرفت. اگر درخواست برنامه هنوز تأیید نشده، کمی صبر کن؛ وگرنه توکن را در تنظیمات بررسی کن.',
  busy: 'BGG فعلاً شلوغ است یا درخواست‌ها زیاد بوده. چند ثانیه بعد دوباره امتحان کن.',
  not_found: 'این بازی در BGG پیدا نشد.',
  bad_response: 'پاسخ BGG قابل خواندن نبود.',
};

// BGG asks for at most one request every couple of seconds.
let lastRequest = 0;
async function politeFetch(url: string, token: string, signal?: AbortSignal) {
  const wait = lastRequest + 2000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new BggError('offline');
  }
}

async function getXml(path: string, signal?: AbortSignal): Promise<Document> {
  if (!navigator.onLine) throw new BggError('offline');
  const token = await loadApiKey(BGG_SECRET);
  if (!token) throw new BggError('not_configured');
  let res = await politeFetch(`${BASE}${path}`, token, signal);
  // 202 = queued; 429/503 = slow down. Retry a couple of times, then give up.
  for (const delay of [3000, 6000]) {
    if (res.status !== 202 && res.status !== 429 && res.status !== 503) break;
    await new Promise((r) => setTimeout(r, delay));
    res = await politeFetch(`${BASE}${path}`, token, signal);
  }
  if (res.status === 401 || res.status === 403) throw new BggError('auth');
  if (res.status === 202 || res.status === 429 || res.status === 503) throw new BggError('busy');
  if (!res.ok) throw new BggError('bad_response');
  return parseXml(await res.text());
}

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new BggError('bad_response');
  return doc;
}

const attr = (el: Element | null | undefined, name = 'value') => el?.getAttribute(name) ?? undefined;
/** Remote text: strip control/format characters and bound the length. */
const clean = (s: string | undefined) => (s ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const num = (el: Element | null | undefined) => {
  const v = Number(attr(el));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

export interface BggSearchHit {
  id: string;
  name: string;
  year?: number;
  expansion: boolean;
}

export function parseSearch(doc: Document): BggSearchHit[] {
  return Array.from(doc.querySelectorAll('items > item')).flatMap((item) => {
    const id = item.getAttribute('id');
    const name = clean(attr(item.querySelector('name[type="primary"]')) ?? attr(item.querySelector('name')));
    if (!id || !/^\d{1,9}$/.test(id) || !name) return [];
    return [{ id, name, year: num(item.querySelector('yearpublished')), expansion: item.getAttribute('type') === 'boardgameexpansion' }];
  });
}

export async function searchBgg(query: string, signal?: AbortSignal): Promise<BggSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const doc = await getXml(`/search?type=boardgame,boardgameexpansion&query=${encodeURIComponent(q)}`, signal);
  const hits = parseSearch(doc);
  // Same id can appear once per type; base games first, then by year.
  const seen = new Set<string>();
  return hits
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .sort((a, b) => Number(a.expansion) - Number(b.expansion) || (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 30);
}

export interface BggGame {
  id: string;
  name: string;
  altNames: string[];
  year?: number;
  thumbnail?: string;
  /** Full-size box art. */
  image?: string;
  minPlayers?: number;
  maxPlayers?: number;
  /** Counts where "Best" got the most votes in the community poll. */
  bestPlayers: number[];
  playTimeMin?: number;
  playTimeMax?: number;
  /** BGG average weight, already on a 1–5 scale. */
  weight?: number;
  weightVotes: number;
  categories: string[];
  mechanics: string[];
  /** Persian style tags derived from BGG categories/mechanics/rank families. */
  tags: string[];
  url: string;
}

// BGG vocabulary → the app's style tags (see GAME_TAGS).
const TAG_MAP: Record<string, string> = {
  'Cooperative Game': 'همکاری',
  'Team-Based Game': 'تیمی',
  Bluffing: 'بلوف',
  'Hidden Roles': 'بلوف',
  'Party Game': 'مهمانی',
  'Card Game': 'کارتی',
  Dice: 'تاس',
  'Dice Rolling': 'تاس',
  'Word Game': 'کلمات',
  'Real-time': 'سرعتی',
  'Abstract Strategy': 'فکری',
  Deduction: 'فکری',
  Puzzle: 'فکری',
  'Children\'s Game': 'خانوادگی',
};
const FAMILY_MAP: Record<string, string> = {
  familygames: 'خانوادگی',
  strategygames: 'استراتژی',
  partygames: 'مهمانی',
  abstracts: 'فکری',
};

function bestCounts(item: Element): number[] {
  const poll = item.querySelector('poll[name="suggested_numplayers"]');
  if (!poll || Number(poll.getAttribute('totalvotes') ?? 0) < 5) return [];
  const out: number[] = [];
  for (const results of Array.from(poll.querySelectorAll('results'))) {
    const n = Number(results.getAttribute('numplayers'));
    if (!Number.isInteger(n)) continue; // skips "4+"
    const votes = (v: string) => Number(attr(results.querySelector(`result[value="${v}"]`), 'numvotes') ?? 0);
    const best = votes('Best');
    if (best > 0 && best >= votes('Recommended') && best >= votes('Not Recommended')) out.push(n);
  }
  return out;
}

export function parseThing(doc: Document): BggGame | undefined {
  const item = doc.querySelector('items > item');
  const id = item?.getAttribute('id');
  if (!item || !id || !/^\d{1,9}$/.test(id)) return undefined;
  const name = clean(attr(item.querySelector('name[type="primary"]')));
  const altNames = Array.from(item.querySelectorAll('name[type="alternate"]'))
    .map((n) => clean(attr(n)))
    .filter(Boolean);
  // Keep Persian/Arabic-script alternates first; the full list can be long.
  altNames.sort((a, b) => Number(/[؀-ۿ]/.test(b)) - Number(/[؀-ۿ]/.test(a)));
  const links = (type: string) => Array.from(item.querySelectorAll(`link[type="${type}"]`)).map((l) => clean(attr(l)));
  const categories = links('boardgamecategory');
  const mechanics = links('boardgamemechanic');
  const families = Array.from(item.querySelectorAll('ranks > rank[type="family"]')).map((r) => r.getAttribute('name') ?? '');
  const tags = [...new Set([...categories, ...mechanics].map((t) => TAG_MAP[t]).concat(families.map((f) => FAMILY_MAP[f])).filter(Boolean))];
  const weight = num(item.querySelector('statistics ratings averageweight'));
  const weightVotes = Number(attr(item.querySelector('statistics ratings numweights')) ?? 0);
  const thumb = item.querySelector('thumbnail')?.textContent?.trim();
  const image = item.querySelector('image')?.textContent?.trim();
  return {
    id,
    name,
    altNames: altNames.slice(0, 8),
    year: num(item.querySelector('yearpublished')),
    thumbnail: thumb && /^https:\/\//.test(thumb) ? thumb : undefined,
    image: image && /^https:\/\//.test(image) ? image : undefined,
    minPlayers: num(item.querySelector('minplayers')),
    maxPlayers: num(item.querySelector('maxplayers')),
    bestPlayers: bestCounts(item),
    playTimeMin: num(item.querySelector('minplaytime')) ?? num(item.querySelector('playingtime')),
    playTimeMax: num(item.querySelector('maxplaytime')) ?? num(item.querySelector('playingtime')),
    weight: weight && weightVotes > 0 ? Math.round(weight * 10) / 10 : undefined,
    weightVotes,
    categories,
    mechanics,
    tags,
    url: `https://boardgamegeek.com/boardgame/${id}`,
  };
}

export async function fetchBggGame(id: string, signal?: AbortSignal): Promise<BggGame> {
  if (!/^\d{1,9}$/.test(id)) throw new BggError('not_found');
  const game = parseThing(await getXml(`/thing?id=${id}&stats=1`, signal));
  if (!game || game.id !== id) throw new BggError('not_found');
  return game;
}
