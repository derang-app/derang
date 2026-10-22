import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { collectOrphanPhotos, requestPersistence } from './lib/startup';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// New versions install in the background and apply on the next launch.
if (import.meta.env.PROD) registerSW({ immediate: true });
requestPersistence();
setTimeout(() => collectOrphanPhotos().catch(() => undefined), 5000);
