import { db } from '../db/db';
import { getSetting } from '../db/settings';

/** Ask the browser not to evict our data under storage pressure (granted silently for installed PWAs). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not supported; backups remain the safety net.
  }
}

/** Remove photos no longer referenced (e.g. picked in a form that was then cancelled). */
export async function collectOrphanPhotos(graceMs = 60 * 60 * 1000) {
  const used = new Set<string>();
  for (const c of await db.bookCopies.toArray()) c.photoIds.forEach((id) => used.add(id));
  for (const c of await db.gameCopies.toArray()) c.photoIds.forEach((id) => used.add(id));
  for (const p of await db.players.toArray()) if (p.photoId) used.add(p.photoId);
  const profile = await getSetting('profile');
  if (profile.photoId) used.add(profile.photoId);
  const cutoff = Date.now() - graceMs;
  const orphans = (await db.photos.toCollection().primaryKeys()) as string[];
  const stale: string[] = [];
  for (const id of orphans) {
    if (used.has(id)) continue;
    const p = await db.photos.get(id);
    if (p && p.createdAt < cutoff) stale.push(id);
  }
  if (stale.length) await db.photos.bulkDelete(stale);
}
