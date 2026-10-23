import JSZip from 'jszip';
import { z } from 'zod';
import { DATA_TABLES, db, type DataTable } from '../db/db';
import type { Photo } from '../db/types';

export const BACKUP_FORMAT = 'derang-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXT = '.drng';

/** KV keys that must never leave the device (secrets live in a separate DB anyway). */
const PRIVATE_KV = new Set<string>(['ai.secret']);

/**
 * Settings restorable from a file. The AI gateway address is a device-local trust
 * decision and is never taken from a file (it would decide where the API key goes).
 */
const KV_SCHEMAS = {
  profile: z.object({ name: z.string().max(100).optional(), photoId: z.string().optional(), bio: z.string().max(2000).optional() }).strip(),
  reminder: z.object({ enabled: z.boolean(), hour: z.number().int().min(0).max(23) }).strip(),
  ai: z.object({ provider: z.literal('anthropic'), model: z.string().regex(/^[\w.-]{1,80}$/), includeNotes: z.boolean() }).strip(),
  dismissed: z.record(z.string(), z.number()),
} as const;

function cleanKv(rows: unknown[]) {
  return rows.flatMap((r) => {
    if (!isObj(r) || !isStr(r.key) || !(r.key in KV_SCHEMAS)) return [];
    const parsed = KV_SCHEMAS[r.key as keyof typeof KV_SCHEMAS].safeParse(r.value);
    return parsed.success ? [{ key: r.key, value: parsed.data }] : [];
  });
}

// Limits for files picked by the user: guard against corrupt or crafted archives.
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const MAX_JSON_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024 * 1024;

function safeParse(text: string): unknown {
  return JSON.parse(text, (key, value) =>
    key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value,
  );
}

function declaredSize(entry: JSZip.JSZipObject): number {
  // JSZip exposes the central-directory size only on this internal field; fail closed if it's missing.
  return (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? Infinity;
}

interface JSZipStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): JSZipStream;
  on(event: 'error', cb: (e: Error) => void): JSZipStream;
  on(event: 'end', cb: () => void): JSZipStream;
  pause(): JSZipStream;
  resume(): JSZipStream;
}

/** Decompress one entry while counting the bytes actually produced (headers can lie). */
function readCapped(entry: JSZip.JSZipObject, cap: number, budget: { left: number }): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let seen = 0;
    // `internalStream` exists at runtime but is missing from JSZip's type definitions.
    const stream = (entry as unknown as { internalStream(type: 'uint8array'): JSZipStream }).internalStream('uint8array');
    stream
      .on('data', (c: Uint8Array) => {
        seen += c.length;
        budget.left -= c.length;
        if (seen > cap || budget.left < 0) {
          stream.pause();
          reject(new BackupError('حجم بازشدهٔ فایل بیش از حد بزرگ است.'));
        } else chunks.push(c);
      })
      .on('error', (e: Error) => reject(e))
      .on('end', () => {
        const out = new Uint8Array(seen);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        resolve(out);
      })
      .resume();
  });
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  createdAt: number;
  counts: Record<string, number>;
}

type PhotoMeta = Omit<Photo, 'blob' | 'thumb'>;

export interface ParsedBackup {
  manifest: BackupManifest;
  data: Record<DataTable, unknown[]>;
  photos: Photo[];
  sizeBytes: number;
}

export class BackupError extends Error {}

export async function createBackup(appVersion: string): Promise<Blob> {
  const zip = new JSZip();
  const data = {} as Record<DataTable, unknown[]>;
  const counts: Record<string, number> = {};
  let photos: Photo[] = [];
  await db.transaction('r', [...DATA_TABLES.map((t) => db.table(t)), db.photos], async () => {
    for (const t of DATA_TABLES) {
      let rows = await db.table(t).toArray();
      if (t === 'kv') rows = rows.filter((r: { key: string }) => !PRIVATE_KV.has(r.key));
      data[t] = rows;
      counts[t] = rows.length;
    }
    photos = await db.photos.toArray();
  });
  // Blob reads happen outside the transaction (non-IndexedDB awaits would end it).
  const meta: PhotoMeta[] = [];
  for (const p of photos) {
    zip.file(`photos/${p.id}.jpg`, await p.blob.arrayBuffer());
    zip.file(`photos/${p.id}.thumb.jpg`, await p.thumb.arrayBuffer());
    meta.push({ id: p.id, width: p.width, height: p.height, createdAt: p.createdAt });
  }
  zip.file('photos.json', JSON.stringify(meta));
  counts.photos = photos.length;
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    createdAt: Date.now(),
    counts,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data.json', JSON.stringify(data));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/** Read and validate a backup without touching current data. */
export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  if (file.size > MAX_FILE_BYTES) throw new BackupError('فایل بیش از حد بزرگ است.');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new BackupError('این فایل پشتیبان «درنگ» نیست یا آسیب دیده است.');
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new BackupError('تعداد فایل‌های داخل پشتیبان غیرعادی است.');
  let total = 0;
  for (const e of entries) {
    if (e.dir) continue;
    const size = declaredSize(e);
    const limit = e.name.endsWith('.json') ? MAX_JSON_BYTES : MAX_PHOTO_BYTES;
    if (size > limit) throw new BackupError('یکی از بخش‌های فایل بیش از حد بزرگ است.');
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) throw new BackupError('حجم بازشدهٔ فایل بیش از حد بزرگ است.');
  const manifestFile = zip.file('manifest.json');
  const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new BackupError('فایل ناقص است: مشخصات یا داده‌ها پیدا نشد.');

  const budget = { left: MAX_TOTAL_BYTES };
  let manifest: BackupManifest;
  let data: Record<DataTable, unknown[]>;
  let meta: PhotoMeta[] = [];
  try {
    const text = async (e: JSZip.JSZipObject) => new TextDecoder().decode(await readCapped(e, MAX_JSON_BYTES, budget));
    manifest = safeParse(await text(manifestFile)) as BackupManifest;
    data = safeParse(await text(dataFile)) as Record<DataTable, unknown[]>;
    const photosFile = zip.file('photos.json');
    if (photosFile) meta = safeParse(await text(photosFile)) as PhotoMeta[];
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('محتوای فایل پشتیبان قابل خواندن نیست.');
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('این فایل پشتیبان «درنگ» نیست.');
  if (!manifest || typeof manifest !== 'object' || !data || typeof data !== 'object' || !Array.isArray(meta)) {
    throw new BackupError('ساختار فایل پشتیبان معتبر نیست.');
  }
  if (!Number.isInteger(manifest.version) || manifest.version < 1 || manifest.version > BACKUP_VERSION) {
    throw new BackupError('این پشتیبان با نسخهٔ جدیدتری از درنگ ساخته شده است. ابتدا اپ را به‌روز کنید.');
  }
  for (const t of DATA_TABLES) {
    if (!Array.isArray(data[t])) throw new BackupError(`بخش «${t}» در فایل وجود ندارد یا معتبر نیست.`);
  }
  data.kv = cleanKv(data.kv);
  validateRows(data);

  const photos: Photo[] = [];
  for (const m of meta) {
    if (!isObj(m) || !isStr(m.id) || !isNum(m.width) || !isNum(m.height) || !isNum(m.createdAt)) {
      throw new BackupError('مشخصات عکس‌ها معتبر نیست.');
    }
    const full = zip.file(`photos/${m.id}.jpg`);
    const thumb = zip.file(`photos/${m.id}.thumb.jpg`);
    if (!full || !thumb) throw new BackupError('بعضی از عکس‌ها در فایل پشتیبان نیستند.');
    photos.push({
      ...m,
      blob: new Blob([await readCapped(full, MAX_PHOTO_BYTES, budget) as BlobPart], { type: 'image/jpeg' }),
      thumb: new Blob([await readCapped(thumb, MAX_PHOTO_BYTES, budget) as BlobPart], { type: 'image/jpeg' }),
    });
  }

  // Every photo referenced by an item must be in the file.
  const photoIds = new Set(photos.map((p) => p.id));
  const referenced = [
    ...(data.bookCopies as { photoIds?: string[] }[]).flatMap((c) => c.photoIds ?? []),
    ...(data.gameCopies as { photoIds?: string[] }[]).flatMap((c) => c.photoIds ?? []),
    ...(data.players as { photoId?: string }[]).map((p) => p.photoId).filter(Boolean),
  ] as string[];
  const missing = referenced.filter((id) => !photoIds.has(id));
  if (missing.length) throw new BackupError(`${missing.length} عکس مرتبط در فایل پیدا نشد.`);

  return { manifest, data, photos, sizeBytes: file.size };
}

/** Replace all current data with the backup's content in one transaction. */
export async function restoreBackup(parsed: ParsedBackup) {
  const tables = [...DATA_TABLES.map((t) => db.table(t)), db.photos];
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    await db.photos.bulkAdd(parsed.photos);
    for (const t of DATA_TABLES) {
      const rows = t === 'kv' ? cleanKv(parsed.data[t]) : parsed.data[t];
      await db.table(t).bulkAdd(rows);
    }
  });
}

export function backupFileName(ts = Date.now()) {
  const d = new Date(ts);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `Derang_Backup_${stamp}${BACKUP_EXT}`;
}

/** Deletes every item, photo and stored AI answer (secrets are handled separately). */
export async function wipeAllData() {
  const tables = [...DATA_TABLES.map((t) => db.table(t)), db.photos];
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
  });
}

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown) => Array.isArray(v) && v.every(isStr);
const isNumArr = (v: unknown) => Array.isArray(v) && v.every(isNum);
const optStr = (v: unknown) => v === undefined || isStr(v);
const optNum = (v: unknown) => v === undefined || isNum(v);
const oneOf = (v: unknown, values: string[]) => isStr(v) && values.includes(v);

const SOURCES = ['manual', 'rulebook', 'online', 'ai_unconfirmed', 'ai_confirmed'];
const MATCH = ['unidentified', 'suggested', 'confirmed'];
const optHttp = (v: unknown) => v === undefined || (isStr(v) && /^https?:\/\//i.test(v));
const AI_KINDS = ['identify_book', 'identify_game', 'reflection_questions', 'creative_idea', 'connections', 'picker_explain', 'wishlist_suggest', 'reading_insight'];
const isProv = (v: unknown) => isObj(v) && Object.values(v).every((s) => oneOf(s, SOURCES));

/** Shape and reference checks for every row, so a bad file can't put broken records into the app. */
function validateRows(data: Record<DataTable, unknown[]>) {
  const check = (table: DataTable, ok: (r: Row) => boolean) => {
    data[table].forEach((r, i) => {
      if (!isObj(r) || !isStr(r.id) || !ok(r)) throw new BackupError(`ردیف ${i + 1} در بخش «${table}» معتبر نیست.`);
    });
  };
  const ids = (table: DataTable) => new Set((data[table] as Row[]).map((r) => r?.id));

  check('bookWorks', (r) => isStrArr(r.authors) && isStrArr(r.altTitles) && isProv(r.provenance) && optStr(r.title) && optHttp(r.refUrl));
  const bookWorks = ids('bookWorks');
  check(
    'bookCopies',
    (r) =>
      isStr(r.workId) && bookWorks.has(r.workId) && isStr(r.title) && isStrArr(r.translators) && isStrArr(r.photoIds) &&
      typeof r.owned === 'boolean' && oneOf(r.status, ['unread', 'reading', 'read']) && oneOf(r.matchStatus, MATCH) &&
      isProv(r.provenance) && optNum(r.pageCount) && optNum(r.currentPage) && optNum(r.rating) && optStr(r.isbn),
  );
  const bookCopies = ids('bookCopies');
  check('readingLogs', (r) => isStr(r.copyId) && bookCopies.has(r.copyId) && isNum(r.at) && isNum(r.fromPage) && isNum(r.toPage));
  check('notes', (r) => isStr(r.copyId) && bookCopies.has(r.copyId) && oneOf(r.kind, ['note', 'quote']) && isStr(r.text) && isStrArr(r.tags));
  check(
    'gameWorks',
    (r) => isStrArr(r.altNames) && isNumArr(r.recommendedPlayers) && isStrArr(r.tags) && isProv(r.provenance) &&
      optNum(r.minPlayers) && optNum(r.maxPlayers) && optNum(r.playTimeMin) && optNum(r.playTimeMax) && optNum(r.complexity) &&
      optHttp(r.refUrl) && (r.bggId === undefined || (isStr(r.bggId) && /^\d{1,9}$/.test(r.bggId))),
  );
  const gameWorks = ids('gameWorks');
  check(
    'gameCopies',
    (r) => isStr(r.workId) && gameWorks.has(r.workId) && isStr(r.name) && isStrArr(r.photoIds) && typeof r.owned === 'boolean' &&
      isNumArr(r.favoritePlayers) && oneOf(r.matchStatus, MATCH) && isProv(r.provenance),
  );
  const gameCopies = ids('gameCopies');
  check('players', (r) => isStr(r.name) && isStrArr(r.likes) && isStrArr(r.dislikes) && optStr(r.photoId));
  check(
    'sessions',
    (r) => isStr(r.gameCopyId) && gameCopies.has(r.gameCopyId) && isNum(r.at) && isStrArr(r.playerIds) && isStrArr(r.winnerIds) &&
      oneOf(r.result, ['win', 'loss', 'draw', 'unknown']),
  );
  check('aiResponses', (r) => oneOf(r.kind, AI_KINDS) && isStr(r.text) && isStr(r.model) && isNum(r.createdAt) && optStr(r.targetId) && optStr(r.prompt));
  // Structured identification results could be written straight into records from the review
  // screen, so they're never taken from a file; the text stays and identification can be re-run.
  for (const r of data.aiResponses as Row[]) delete r.data;
}
