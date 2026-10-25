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
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    // Which deploy is running, so a phone stuck on an old version is easy to spot.
    __APP_BUILD__: JSON.stringify({ sha: (process.env.GITHUB_SHA ?? 'dev').slice(0, 7), at: Date.now() }),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      // fix.html stays network-only so it still loads on a phone stuck on an old cached version.
      // (The web manifest is left out of the precache in sw.ts.)
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'], globIgnores: ['fix.html'] },
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
        // Shows Derang in Android's share sheet (e.g. «اشتراک‌گذاری» in Taaghche, which shares an
        // image with the link text); received in src/sw.ts, see src/lib/share.ts.
        share_target: {
          action: `${base}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'image', accept: ['image/*', '.jpg', '.jpeg', '.png', '.webp'] }] },
        },
        // A share or a launch reuses the open window instead of starting a second copy of the app,
        // which could hold the database while Android keeps it frozen in the background.
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
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
