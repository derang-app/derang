import JSZip from 'jszip';
import { DATA_TABLES, db, type DataTable } from '../db/db';
import type { Photo } from '../db/types';

export const BACKUP_FORMAT = 'derang-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXT = '.drng';

/** KV keys that must never leave the device (secrets live in a separate DB anyway). */
const PRIVATE_KV = new Set<string>(['ai.secret']);

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
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new BackupError('این فایل پشتیبان «درنگ» نیست یا آسیب دیده است.');
  }
  const manifestFile = zip.file('manifest.json');
  const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new BackupError('فایل ناقص است: مشخصات یا داده‌ها پیدا نشد.');

  let manifest: BackupManifest;
  let data: Record<DataTable, unknown[]>;
  let meta: PhotoMeta[] = [];
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
    data = JSON.parse(await dataFile.async('string'));
    const photosFile = zip.file('photos.json');
    if (photosFile) meta = JSON.parse(await photosFile.async('string'));
  } catch {
    throw new BackupError('محتوای فایل پشتیبان قابل خواندن نیست.');
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('این فایل پشتیبان «درنگ» نیست.');
  if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION) {
    throw new BackupError('این پشتیبان با نسخهٔ جدیدتری از درنگ ساخته شده است. ابتدا اپ را به‌روز کنید.');
  }
  for (const t of DATA_TABLES) {
    if (!Array.isArray(data[t])) throw new BackupError(`بخش «${t}» در فایل وجود ندارد یا معتبر نیست.`);
    if (!data[t].every((r) => r && typeof r === 'object' && ('id' in r || 'key' in r))) {
      throw new BackupError(`ردیف‌های نامعتبر در بخش «${t}».`);
    }
  }

  const photos: Photo[] = [];
  for (const m of meta) {
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
