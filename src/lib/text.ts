const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Render Latin digits as Persian digits. */
export function fa(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Convert Persian/Arabic digits to Latin. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Parse a user-typed number in any digit system; returns undefined for blank/invalid. */
export function parseNum(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const s = toLatinDigits(value).replace(/[٫,]/g, '.').replace(/\s/g, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse "2-5", "۲ تا ۵", "4" into a range. */
export function parseRange(value: string | undefined): { min?: number; max?: number } {
  if (!value) return {};
  const parts = toLatinDigits(value)
    .split(/\s*(?:-|–|تا|to)\s*/)
    .map((p) => parseNum(p))
    .filter((n): n is number => n !== undefined);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
}

/** Parse "3, 4" into a list of integers. */
export function parseList(value: string | undefined): number[] {
  if (!value) return [];
  return toLatinDigits(value)
    .split(/[,،\s]+/)
    .map((p) => parseNum(p))
    .filter((n): n is number => n !== undefined && Number.isInteger(n));
}

export function formatRange(min?: number, max?: number): string {
  if (min === undefined && max === undefined) return '';
  if (min === undefined) return fa(max);
  if (max === undefined || max === min) return fa(min);
  return `${fa(min)}-${fa(max)}`;
}

/**
 * Normalize Persian/Arabic text for search: unify ي/ى→ی and ك→ک, drop diacritics
 * and tatweel, unify digits, and remove spaces and ZWNJ so «کتاب‌ها», «کتاب ها» and
 * «كتابها» all match.
 */
export function normalizeForSearch(value: string): string {
  return toLatinDigits(value)
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[\s‌‍‎‏_\-.,،:؛!?؟«»"'()]/g, '');
}

export function matchesQuery(query: string, ...fields: (string | undefined | string[])[]): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return fields.some((f) => {
    if (!f) return false;
    const values = Array.isArray(f) ? f : [f];
    return values.some((v) => normalizeForSearch(v).includes(q));
  });
}

/** Split a comma/«،»/newline-separated list typed by the user. */
export function splitNames(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,،\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinNames(values: string[] | undefined): string {
  return (values ?? []).join('، ');
}

export function clean(value: string | undefined): string | undefined {
  const s = value?.trim();
  return s ? s : undefined;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}
