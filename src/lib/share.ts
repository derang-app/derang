// Android share sheet → Derang (Web Share Target, see the manifest's share_target).
// Android opens the app at its start URL with ?title=&text=&url=; the Taaghche app puts
// a sentence with the book link in `text`. Turn that into the add screen with the
// shared text, so it can fetch the book right away.

export const SHARE_PARAMS = ['title', 'text', 'url'] as const;

/** Call once before the router starts: rewrites a share launch into `#/add?share=…`. */
export function routeSharedText() {
  const q = new URLSearchParams(window.location.search);
  const shared = SHARE_PARAMS.map((k) => q.get(k)?.trim())
    .filter(Boolean)
    .join(' ');
  if (!shared) return;
  const add = new URLSearchParams({ type: 'book', share: shared.slice(0, 2000) });
  window.history.replaceState(null, '', `${window.location.pathname}#/add?${add}`);
}
