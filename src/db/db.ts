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

/**
 * Android freezes a copy of the app soon after it leaves the screen. A copy frozen in the
 * middle of a database read keeps its lock, and every save in the copy you are using then
 * waits forever behind it (a second copy appears e.g. with a share from Taaghche, or with
 * the app also open in a Chrome tab). Dexie re-reads in every copy whenever any copy saves,
 * so a background copy is reading exactly when the visible one writes.
 * So a hidden copy lets go of the database: Dexie's own back/forward-cache handling (a
 * "persisted" pagehide) closes the connection and stops listening to other copies. Dexie
 * would reopen on the next read, so auto-open is switched off too; live queries treat the
 * closed database as "no news" and keep showing what they had. Back on screen, the database
 * reopens and the matching pageshow re-reads every live query. Nothing remounts, so a
 * half-filled form survives a trip to the gallery.
 */
let released = false;

export function releaseWhileHidden() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !released) {
      released = true;
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      db.close({ disableAutoOpen: true });
    } else if (document.visibilityState === 'visible') {
      void wake();
    }
  });
}

/**
 * Reopen the database if it was let go while hidden. A photo from the camera (or a shared
 * image) can arrive before the page reports itself visible again; with auto-open off its
 * save would then fail at once, so saves that can come back from another app call this first.
 */
export async function wake() {
  if (!released) return;
  released = false;
  await db.open().catch(() => undefined);
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
}

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
