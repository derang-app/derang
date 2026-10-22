import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

// API keys live in their own database: never in the data DB, so they can't end up
// in a backup. They're encrypted with a non-extractable AES key generated on this
// device (the browser can use it but script can't read its raw bytes).

interface SecretRow {
  id: string;
  iv: Uint8Array;
  data: ArrayBuffer;
  hint: string;
}
interface KeyRow {
  id: string;
  key: CryptoKey;
}

class SecretsDB extends Dexie {
  secrets!: EntityTable<SecretRow, 'id'>;
  keys!: EntityTable<KeyRow, 'id'>;
  constructor() {
    super('derang-secrets');
    this.version(1).stores({ secrets: 'id', keys: 'id' });
  }
}

const sdb = new SecretsDB();

async function deviceKey(): Promise<CryptoKey> {
  const existing = await sdb.keys.get('device');
  if (existing) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await sdb.keys.put({ id: 'device', key });
  return key;
}

export async function saveApiKey(provider: string, apiKey: string) {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey.trim()));
  // Only the last 4 characters are kept readable, to show which key is set.
  await sdb.secrets.put({ id: provider, iv, data, hint: apiKey.trim().slice(-4) });
}

export async function loadApiKey(provider: string): Promise<string | undefined> {
  const row = await sdb.secrets.get(provider);
  if (!row) return undefined;
  const key = await deviceKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as BufferSource }, key, row.data);
  return new TextDecoder().decode(plain);
}

export async function clearApiKey(provider: string) {
  await sdb.secrets.delete(provider);
}

export function useApiKeyHint(provider: string): string | null | undefined {
  return useLiveQuery(async () => (await sdb.secrets.get(provider))?.hint ?? null, [provider]);
}
