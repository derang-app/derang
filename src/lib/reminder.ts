import { setSetting } from '../db/settings';
import { REMINDER_TAG } from './reminderTag';

// A web app can't schedule exact-time alarms without a server. Installed PWAs on
// Chrome for Android get Periodic Background Sync: the browser wakes the service
// worker roughly daily, and it shows one calm notification if nothing was read
// today. Elsewhere the reminder appears only inside the app (on Home).

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: { register(tag: string, opts: { minInterval: number }): Promise<void>; unregister(tag: string): Promise<void> };
};


export function reminderSupport() {
  const periodic = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PeriodicSyncManager' in window && 'Notification' in window;
  return {
    periodic,
    note: periodic ? 'روزی حداکثر یک اعلان آرام، اگر آن روز چیزی نخوانده باشی' : 'در این مرورگر فقط داخل اپ (صفحهٔ خانه) یادآوری می‌شود',
  };
}

/** Returns 'ok' or a message explaining why notifications are unavailable. */
export async function enableReminder(hour: number): Promise<string> {
  await setSetting('reminder', { enabled: true, hour });
  if (!reminderSupport().periodic) return 'ok';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'اجازهٔ اعلان داده نشد؛ یادآور فقط داخل اپ نمایش داده می‌شود.';
  try {
    const reg = (await navigator.serviceWorker.ready) as PeriodicSyncRegistration;
    await reg.periodicSync?.register(REMINDER_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    return 'ok';
  } catch {
    return 'برای اعلان، اپ را از منوی مرورگر «نصب» کن؛ تا آن موقع یادآور داخل اپ است.';
  }
}

export async function disableReminder() {
  await setSetting('reminder', { enabled: false });
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as PeriodicSyncRegistration;
    await reg.periodicSync?.unregister(REMINDER_TAG);
  } catch {
    // Nothing registered.
  }
}
