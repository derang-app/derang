/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { DerangDB } from './db/db';
import { REMINDER_TAG } from './lib/reminderTag';

declare const self: ServiceWorkerGlobalScope;

// Offline: precache the whole app shell. Updates activate immediately so a new
// deploy reaches the phone on the next launch.
// A share from another app opens the start URL with ?title=&text=&url= (see lib/share);
// it's still the precached app shell, so it works offline too.
// The web manifest stays network-only: Chrome reads it when installing and updating the
// installed app, and a cached old copy would hide new features such as the share target.
// (vite-plugin-pwa always adds it to the list, so it's filtered out here.)
const precache = self.__WB_MANIFEST.filter((e) => !(typeof e === 'string' ? e : e.url).endsWith('.webmanifest'));
precacheAndRoute(precache, { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^(title|text|url)$/] });
cleanupOutdatedCaches();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

async function maybeRemind() {
  const db = new DerangDB();
  try {
    const setting = (await db.kv.get('reminder'))?.value as { enabled?: boolean; hour?: number } | undefined;
    if (!setting?.enabled) return;
    const now = new Date();
    if (now.getHours() < (setting.hour ?? 21)) return;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const last = (await db.kv.get('reminder.lastShown'))?.value as number | undefined;
    if (last && last >= today.getTime()) return;
    const readToday = await db.readingLogs.where('at').aboveOrEqual(today.getTime()).count();
    const reading = await db.bookCopies.where('status').equals('reading').count();
    if (readToday > 0 || reading === 0) return;
    await db.kv.put({ key: 'reminder.lastShown', value: now.getTime() });
    await self.registration.showNotification('درنگ', {
      body: 'اگر حوصله‌اش هست، چند صفحه‌ای از کتابت بخوان.',
      icon: 'icon-192.png',
      // Status-bar badge: white silhouette on transparent (Android masks it to one colour).
      badge: 'badge-96.png',
      lang: 'fa',
      dir: 'rtl',
      tag: REMINDER_TAG,
    });
  } finally {
    db.close();
  }
}

self.addEventListener('periodicsync', (event) => {
  const e = event as PeriodicSyncEvent;
  if (e.tag === REMINDER_TAG) e.waitUntil(maybeRemind());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const open = list[0];
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
