import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { collectOrphanPhotos, requestPersistence } from './lib/startup';
import { captureInstallPrompt } from './lib/install';
import { routeSharedText } from './lib/share';

captureInstallPrompt();
routeSharedText();
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// New versions install in the background and the app reloads into them. The browser
// only looks for one on a fresh launch, but Android usually resumes the installed app
// from memory instead, so also look whenever it comes back to the foreground.
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      let last = Date.now();
      const check = () => {
        if (Date.now() - last < 60_000 || !navigator.onLine) return;
        last = Date.now();
        reg.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 60 * 60_000);
    },
    // Don't reload under the user's fingers while they type; wait until they leave the field or the app.
    onNeedReload() {
      const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (!typing()) return window.location.reload();
      const later = () => {
        if (typing() && document.visibilityState === 'visible') return;
        document.removeEventListener('focusout', soon);
        document.removeEventListener('visibilitychange', later);
        window.location.reload();
      };
      const soon = () => setTimeout(later, 0);
      document.addEventListener('focusout', soon);
      document.addEventListener('visibilitychange', later);
    },
  });
}
requestPersistence();
setTimeout(() => collectOrphanPhotos().catch(() => undefined), 5000);
