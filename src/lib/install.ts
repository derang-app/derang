import { useEffect, useState } from 'react';

// Chrome fires `beforeinstallprompt` once, early; keep it so Settings can offer
// an explicit "install" button later.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export type InstallState = 'running-installed' | 'installed' | 'can-install' | 'unknown';

async function detect(): Promise<InstallState> {
  if (matchMedia('(display-mode: standalone)').matches) return 'running-installed';
  if (deferred) return 'can-install';
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  try {
    if (nav.getInstalledRelatedApps && (await nav.getInstalledRelatedApps()).length > 0) return 'installed';
  } catch {
    // Not supported.
  }
  return 'unknown';
}

export function useInstallState() {
  const [state, setState] = useState<InstallState>();
  useEffect(() => {
    const update = () => void detect().then(setState);
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };
  return { state, install };
}
