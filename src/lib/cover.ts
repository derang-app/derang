import { updateCopy } from '../db/books';
import { db } from '../db/db';
import { updateGameCopy } from '../db/games';
import { importPhoto } from './images';

export type CoverKind = 'book' | 'game';

/**
 * Make a stored photo the cover (the first photo). Earlier photos stay with the copy,
 * so nothing of mine is lost; they can be removed from the edit screen.
 */
export async function setCover(kind: CoverKind, copyId: string, photoId: string) {
  const copy = kind === 'book' ? await db.bookCopies.get(copyId) : await db.gameCopies.get(copyId);
  if (!copy) throw new Error('not found');
  const photoIds = [photoId, ...copy.photoIds.filter((p) => p !== photoId)];
  if (kind === 'book') await updateCopy(copyId, { photoIds });
  else await updateGameCopy(copyId, { photoIds });
}

export async function setCoverFromBlob(kind: CoverKind, copyId: string, blob: Blob) {
  const id = await importPhoto(blob);
  await setCover(kind, copyId, id);
  return id;
}
