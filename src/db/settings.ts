import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

export interface Profile {
  name?: string;
  photoId?: string;
  bio?: string;
}

export interface ReminderSettings {
  enabled: boolean;
  /** Preferred hour of day (0–23). */
  hour: number;
}

export interface AiSettings {
  provider: 'anthropic';
  model: string;
  /** Optional gateway/proxy base URL; defaults to the provider's own API. */
  baseUrl?: string;
  /** Whether notes/quotes may be included when I ask the reading companion. */
  includeNotes: boolean;
}

export const DEFAULTS = {
  profile: {} as Profile,
  reminder: { enabled: false, hour: 21 } as ReminderSettings,
  ai: { provider: 'anthropic', model: 'claude-opus-5-5', includeNotes: true } as AiSettings,
  dismissed: {} as Record<string, number>,
};

type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = await db.kv.get(key);
  return { ...(DEFAULTS[key] as object), ...((row?.value as object) ?? {}) } as (typeof DEFAULTS)[K];
}

export async function setSetting<K extends Key>(key: K, value: Partial<(typeof DEFAULTS)[K]>) {
  const current = await getSetting(key);
  await db.kv.put({ key, value: { ...(current as object), ...(value as object) } });
}

export function useSetting<K extends Key>(key: K): (typeof DEFAULTS)[K] | undefined {
  return useLiveQuery(() => getSetting(key), [key]);
}
