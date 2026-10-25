// Android share sheet → Derang (Web Share Target, see the manifest's share_target).
// The Taaghche app shares its "share image" together with a sentence holding the book
// link, and Android only offers apps that accept every shared type, so the target takes
// images as well as text. Shares are POSTed to SHARE_ACTION; the service worker keeps
// any image in SHARE_CACHE and opens the add screen with the shared text, which then
// fetches the book right away.

export const SHARE_PARAMS = ['title', 'text', 'url'] as const;
/** Relative to the app's base (manifest scope). */
export const SHARE_ACTION = 'share-target';
export const SHARE_CACHE = 'derang-share';
export const SHARED_IMAGE_KEY = 'shared-image';

/** The add screen for a share, as a hash route. */
export function shareRoute(text: string, image: boolean) {
  const q = new URLSearchParams({ type: 'book', share: text.slice(0, 2000) });
  if (image) q.set('image', '1');
  return `#/add?${q}`;
}

/**
 * Call once before the router starts. Installs made while the target was GET-only
 * open the start URL with ?title=&text=&url=; rewrite that into the add screen.
 */
export function routeSharedText() {
  const q = new URLSearchParams(window.location.search);
  const shared = SHARE_PARAMS.map((k) => q.get(k)?.trim())
    .filter(Boolean)
    .join(' ');
  if (!shared) return;
  window.history.replaceState(null, '', `${window.location.pathname}${shareRoute(shared, false)}`);
}

/** The image that came with the last share, once (it's removed as it's read). */
export async function takeSharedImage(): Promise<Blob | undefined> {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARED_IMAGE_KEY);
    await cache.delete(SHARED_IMAGE_KEY);
    return res ? await res.blob() : undefined;
  } catch {
    return undefined;
  }
}
