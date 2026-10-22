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
    super(name);
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

export const newId = () => crypto.randomUUID();
export const now = () => Date.now();
