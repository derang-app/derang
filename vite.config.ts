/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/; local dev uses /.
const base = process.env.DERANG_BASE ?? '/';
// Public origin, so the manifest can point at itself (lets the app detect its own install).
const site = process.env.DERANG_SITE ?? 'http://localhost:5173';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'] },
      manifest: {
        name: 'درنگ',
        short_name: 'درنگ',
        description: 'مدیریت دنج کتاب و بردگیم',
        lang: 'fa',
        dir: 'rtl',
        // Explicit identity, equal to the implicit one earlier installs got (start_url), so existing installs keep updating.
        id: base,
        start_url: base,
        scope: base,
        related_applications: [{ platform: 'webapp', url: `${site}${base}manifest.webmanifest` }],
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF9F0',
        theme_color: '#FFF9F0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
