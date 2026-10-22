import { db, newId, now } from '../db/db';
import type { Photo } from '../db/types';

const FULL_MAX = 1600;
const THUMB_MAX = 480;

async function decode(file: Blob): Promise<ImageBitmap> {
  // `from-image` applies EXIF orientation so phone photos are not sideways.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

async function encode(bitmap: ImageBitmap, max: number, quality: number) {
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
    const full = await encode(bitmap, FULL_MAX, 0.85);
    const thumb = await encode(bitmap, THUMB_MAX, 0.8);
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
  } finally {
    bitmap.close();
  }
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
