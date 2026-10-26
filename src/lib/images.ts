import { db, newId, now, wake } from '../db/db';
import type { Photo } from '../db/types';

const FULL_MAX = 1600;
const THUMB_MAX = 480;

async function decode(file: Blob): Promise<ImageBitmap> {
  // `from-image` applies EXIF orientation so phone photos are not sideways.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

type Source = ImageBitmap | HTMLCanvasElement;

async function encode(bitmap: Source, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('encode');
  return { blob, width, height };
}

/**
 * Copy a picked/captured image into the app's own storage: a size-capped full
 * image plus a small thumbnail for lists. The original file is no longer needed.
 */
export async function importPhoto(file: Blob): Promise<string> {
  const bitmap = await decode(file);
  try {
    return await savePhoto(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Store an already-decoded image (e.g. a straightened cover scan) the same way. */
export async function savePhoto(source: Source): Promise<string> {
  const full = await encode(source, FULL_MAX, 0.85);
  const thumb = await encode(source, THUMB_MAX, 0.8);
  await wake();
  const photo: Photo = {
    id: newId(),
    blob: full.blob,
    thumb: thumb.blob,
    width: full.width,
    height: full.height,
    createdAt: now(),
  };
  await db.photos.add(photo);
  return photo.id;
}

/** Decode any picked or downloaded image file, upright. */
export const decodeImage = decode;

/** Draw an image into a canvas no larger than `max` on its long side. */
export function toCanvas(source: Source, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}

export async function deletePhotos(ids: string[]) {
  if (ids.length) await db.photos.bulkDelete(ids);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
