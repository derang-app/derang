import Dexie, { type EntityTable } from 'dexie';
import type {
  AiResponse,
  BookCopy,
  BookWork,
  GameCopy,
  GameWork,
  KV,
  Note,
  Photo,
  Player,
  ReadingLog,
  Session,
} from './types';

export class DerangDB extends Dexie {
  bookWorks!: EntityTable<BookWork, 'id'>;
  bookCopies!: EntityTable<BookCopy, 'id'>;
  readingLogs!: EntityTable<ReadingLog, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  gameWorks!: EntityTable<GameWork, 'id'>;
  gameCopies!: EntityTable<GameCopy, 'id'>;
  players!: EntityTable<Player, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  aiResponses!: EntityTable<AiResponse, 'id'>;
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'derang') {
    // Relaxed: a write commits without waiting for a disk flush, which can stall for seconds on some Android phones.
    super(name, { chromeTransactionDurability: 'relaxed' });
    this.version(1).stores({
      bookWorks: 'id, updatedAt',
      bookCopies: 'id, workId, status, owned, updatedAt',
      readingLogs: 'id, copyId, at',
      notes: 'id, copyId, kind, createdAt',
      gameWorks: 'id, bggId, updatedAt',
      gameCopies: 'id, workId, owned, updatedAt',
      players: 'id, name',
      sessions: 'id, gameCopyId, at',
      photos: 'id',
      aiResponses: 'id, kind, targetId, createdAt',
      kv: 'key',
    });
  }
}

/** Tables included in backups, in restore order. Secrets live in a separate database. */
export const DATA_TABLES = [
  'bookWorks',
  'bookCopies',
  'readingLogs',
  'notes',
  'gameWorks',
  'gameCopies',
  'players',
  'sessions',
  'aiResponses',
  'kv',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

export let db = new DerangDB();

/** Test hook: swap in a fresh database. */
export function setDatabase(next: DerangDB) {
  db = next;
}

/**
 * Android can drop the database connection while the app sits in the background
 * (camera, another app); requests on it then fail or never answer at all.
 * Close and reopen it so the next request gets a fresh connection.
 */
export async function reconnect() {
  db.close({ disableAutoOpen: false });
  await db.open();
}

export class DbTimeout extends Error {
  name = 'DbTimeout';
}

/** Run a save, giving up after `ms` (and reconnecting) instead of leaving a button stuck forever. */
export async function saveWithTimeout<T>(fn: () => Promise<T>, ms = 10_000): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new DbTimeout()), ms);
      }),
    ]);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'DbTimeout' || name === 'DatabaseClosedError' || name === 'UnknownError' || name === 'InvalidStateError') reconnect().catch(() => undefined);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Toast text for a failed save; the error's name is kept so a report from the phone says what went wrong. */
export function saveErrorText(e: unknown) {
  const name = (e as Error)?.name;
  if (name === 'DbTimeout') return 'ذخیره طول کشید و انجام نشد؛ دوباره «ثبت» را بزن.';
  if (name === 'QuotaExceededError') return 'حافظهٔ گوشی پر است؛ ذخیره نشد.';
  return `ذخیره نشد. دوباره تلاش کن.${name ? ` (${name})` : ''}`;
}

/** If a tiny read doesn't answer quickly, the connection is dead (and saveWithTimeout starts a reconnect). */
export async function isConnected(ms = 3000) {
  try {
    await saveWithTimeout(() => db.kv.get('__ping'), ms);
    return true;
  } catch {
    return false;
  }
}

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
