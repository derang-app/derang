import JSZip from 'jszip';
import { DATA_TABLES, db, type DataTable } from '../db/db';
import type { Photo } from '../db/types';

export const BACKUP_FORMAT = 'derang-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXT = '.drng';

/** KV keys that must never leave the device (secrets live in a separate DB anyway). */
const PRIVATE_KV = new Set<string>(['ai.secret']);
/** Only known setting keys are restored from a file. */
const ALLOWED_KV = new Set<string>(['profile', 'reminder', 'ai', 'dismissed']);

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

function declaredSize(entry: JSZip.JSZipObject): number | undefined {
  // JSZip exposes the central-directory size only on this internal field.
  return (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
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
    const size = declaredSize(e) ?? 0;
    const limit = e.name.endsWith('.json') ? MAX_JSON_BYTES : MAX_PHOTO_BYTES;
    if (size > limit) throw new BackupError('یکی از بخش‌های فایل بیش از حد بزرگ است.');
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) throw new BackupError('حجم بازشدهٔ فایل بیش از حد بزرگ است.');
  const manifestFile = zip.file('manifest.json');
  const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new BackupError('فایل ناقص است: مشخصات یا داده‌ها پیدا نشد.');

  let manifest: BackupManifest;
  let data: Record<DataTable, unknown[]>;
  let meta: PhotoMeta[] = [];
  try {
    manifest = safeParse(await manifestFile.async('string')) as BackupManifest;
    data = safeParse(await dataFile.async('string')) as Record<DataTable, unknown[]>;
    const photosFile = zip.file('photos.json');
    if (photosFile) meta = safeParse(await photosFile.async('string')) as PhotoMeta[];
  } catch {
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
  data.kv = data.kv.filter((r) => isObj(r) && typeof r.key === 'string' && ALLOWED_KV.has(r.key) && isObj(r.value));
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
      blob: new Blob([await full.async('arraybuffer')], { type: 'image/jpeg' }),
      thumb: new Blob([await thumb.async('arraybuffer')], { type: 'image/jpeg' }),
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
      const rows = t === 'kv' ? parsed.data[t].filter((r) => !PRIVATE_KV.has((r as { key: string }).key)) : parsed.data[t];
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
const isProv = (v: unknown) => isObj(v) && Object.values(v).every((s) => oneOf(s, SOURCES));

/** Shape and reference checks for every row, so a bad file can't put broken records into the app. */
function validateRows(data: Record<DataTable, unknown[]>) {
  const check = (table: DataTable, ok: (r: Row) => boolean) => {
    data[table].forEach((r, i) => {
      if (!isObj(r) || !isStr(r.id) || !ok(r)) throw new BackupError(`ردیف ${i + 1} در بخش «${table}» معتبر نیست.`);
    });
  };
  const ids = (table: DataTable) => new Set((data[table] as Row[]).map((r) => r?.id));

  check('bookWorks', (r) => isStrArr(r.authors) && isStrArr(r.altTitles) && isProv(r.provenance) && optStr(r.title));
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
      optNum(r.minPlayers) && optNum(r.maxPlayers) && optNum(r.playTimeMin) && optNum(r.playTimeMax) && optNum(r.complexity),
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
  check('aiResponses', (r) => isStr(r.kind) && isStr(r.text) && isStr(r.model) && isNum(r.createdAt));
}
