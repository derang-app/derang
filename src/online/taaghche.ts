// A book's catalogue details from Taaghche, by the id in its link. Taaghche's API only
// answers CORS for taaghche.com, so the request goes through a tiny relay
// (Supabase Edge Function "derang-taaghche-book", hosted in the Planner project) that
// accepts nothing but a numeric book id and returns only the fields below.

import { fa, toLatinDigits } from '../lib/text';
import { CoverError } from './covers';

const RELAY = 'https://byqowlvyupcusjjyxwaf.supabase.co/functions/v1/derang-taaghche-book';

export interface TaaghcheBook {
  id: string;
  title: string;
  authors: string[];
  translators: string[];
  publisher?: string;
  pages?: number;
  /** Taaghche's release date, e.g. "1397/11/08". */
  publishDate?: string;
  audio: boolean;
}

/** Remote text: strip control/format characters and bound the length. */
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '');
const names = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

export async function fetchTaaghcheBook(id: string, signal?: AbortSignal): Promise<TaaghcheBook> {
  if (!navigator.onLine) throw new CoverError('offline');
  let res: Response;
  try {
    res = await fetch(`${RELAY}?id=${encodeURIComponent(id)}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new CoverError('offline');
  }
  if (res.status === 404) throw new CoverError('not_found');
  if (!res.ok) throw new CoverError('bad_response');
  const b = await res.json().catch(() => null);
  const title = clean(b?.title);
  if (!title) throw new CoverError('bad_response');
  const pages = Number(b.pages);
  return {
    id,
    title,
    authors: names(b.authors),
    translators: names(b.translators),
    publisher: clean(b.publisher) || undefined,
    pages: Number.isInteger(pages) && pages > 0 && pages < 100_000 ? pages : undefined,
    publishDate: clean(b.publishDate) || undefined,
    audio: b.audio === true,
  };
}

/** "Free text" publication line for my copy, e.g. «نسخهٔ الکترونیکی طاقچه، ۱۳۹۷». */
export function taaghchePublication(b: TaaghcheBook) {
  const year = toLatinDigits(b.publishDate ?? '').match(/^(1[34]\d\d)/)?.[1];
  const kind = b.audio ? 'کتاب صوتی طاقچه' : 'نسخهٔ الکترونیکی طاقچه';
  return year ? `${kind}، ${fa(year)}` : kind;
}

export const taaghcheBookUrl = (id: string) => `https://taaghche.com/book/${id}`;
