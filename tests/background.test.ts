// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { db, releaseWhileHidden, wake } from '../src/db/db';

let state: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { get: () => state });
if (!('PageTransitionEvent' in window)) (window as any).PageTransitionEvent = class extends Event {};
releaseWhileHidden();

const setVisibility = (next: DocumentVisibilityState) => {
  state = next;
  document.dispatchEvent(new Event('visibilitychange'));
};

it('a save that arrives before the page is visible again still lands', async () => {
  await db.kv.put({ key: 'a', value: 1 });
  setVisibility('hidden'); // the camera opens
  await expect(db.kv.put({ key: 'b', value: 2 })).rejects.toThrow();
  await wake(); // the photo is back before "visible"
  await db.kv.put({ key: 'b', value: 2 });
  setVisibility('visible');
  expect(await db.kv.get('b')).toEqual({ key: 'b', value: 2 });
});
