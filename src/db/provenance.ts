import type { Provenance, Source } from './types';

const MANUAL: Source[] = ['manual', 'rulebook'];

export function isManual(source: Source | undefined) {
  return source !== undefined && MANUAL.includes(source);
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Apply `patch` to `entity`, recording `source` as the origin of every field that
 * actually changed. Fields set to `undefined` are cleared and lose their origin.
 */
export function withProvenance<T extends { provenance: Provenance }>(
  entity: T,
  patch: Partial<T>,
  source: Source,
): T {
  const next = { ...entity, provenance: { ...entity.provenance } };
  for (const [key, value] of Object.entries(patch) as [keyof T & string, unknown][]) {
    if (key === 'provenance' || same(entity[key], value)) continue;
    (next as Record<string, unknown>)[key] = value;
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) delete next.provenance[key];
    else next.provenance[key] = source;
  }
  return next;
}

/**
 * Merge non-manual data (online / AI) without overwriting what the user entered.
 * Fields with a manual origin are only replaced when listed in `override`.
 */
export function mergeExternal<T extends { provenance: Provenance }>(
  entity: T,
  incoming: Partial<T>,
  source: Source,
  override: string[] = [],
): T {
  const allowed: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming) as [keyof T & string, unknown][]) {
    if (value === undefined) continue;
    const current = entity[key];
    const hasValue =
      current !== undefined && current !== '' && !(Array.isArray(current) && current.length === 0);
    if (hasValue && isManual(entity.provenance[key]) && !override.includes(key)) continue;
    (allowed as Record<string, unknown>)[key] = value;
  }
  return withProvenance(entity, allowed, source);
}

export const SOURCE_LABEL: Record<Source, string> = {
  manual: 'ورود دستی',
  rulebook: 'ورود دستی (از دفترچه)',
  online: 'منبع آنلاین',
  ai_unconfirmed: 'پیشنهاد تأییدنشدهٔ AI',
  ai_confirmed: 'پیشنهاد AI، تأییدشده توسط من',
};
