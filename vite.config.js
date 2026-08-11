import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  test: {
    // The suite is 459 pure-function tests and they stay in the DEFAULT `node`
    // environment — booting jsdom for `parseGuestList` costs ~1s per file and
    // buys nothing. Component tests opt IN, one file at a time, with a
    // `// @vitest-environment jsdom` docblock on line 1.
    //
    // Why the docblock and not `environmentMatchGlobs`: that option was REMOVED
    // in Vitest 4 and this repo is on 4.1.10. Measured, not assumed — a config
    // carrying `environmentMatchGlobs: [['**/*.dom.test.jsx', 'jsdom']]` ran the
    // matching file with `typeof document === "undefined"`, with no warning and
    // no error. A config key that is silently ignored is worse than no config.
    //
    // There is deliberately no `setupFiles` either: setup files run for EVERY
    // test file, so a global jest-dom + cleanup setup would tax all 30 node
    // suites for the benefit of six. The component tests import
    // `src/test/dom.js`, which does the same work only where it is used.
    css: {
      // CSS Modules only mean anything in a test if they are actually compiled.
      // With CSS processing off (the default) Vitest returns a Proxy where
      // `styles.anythingAtAllEvenTypos` yields a string — so bug class 9, a
      // renamed class leaving `styles.foo === undefined` and the element
      // rendering `class="undefined"` with no error, is INVISIBLE to a test.
      // Measured both ways: proxy → `styles.nope === "_nope_d09720"`; compiled →
      // `styles.nope === undefined`. Compiled is the only setting under which
      // the class-name assertions below can fail, so it is the one we use.
      // Scoped to `.module.` so global stylesheets are still skipped.
      include: [/\.module\./],
      modules: { classNameStrategy: "non-scoped" },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'כוכב השולחן — סידור הושבה',
        short_name: 'כוכב השולחן',
        description: 'אפליקציית סידור הושבה חכמה לאירועים ישראליים',
        theme_color: '#14161A',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        lang: 'he',
        dir: 'rtl',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The glob above matches EVERY emitted chunk, which quietly undid every
        // lazy import: the precache manifest carried AdminApp-*.js (69 kB),
        // AdminApp-*.css (68 kB) and xlsx-*.js (425 kB), so first visit
        // downloaded 1.79 MB including 137 kB of admin panel for every paying
        // customer. Code-splitting held in the JS graph and was defeated by the
        // service worker.
        globIgnores: ['**/AdminApp-*.{js,css}', '**/xlsx-*.js'],
        // The self-hosted serif and the hero are what the landing page IS. They
        // are not matched by the glob (ttf, mp4, jpg), so the installed app fell
        // back to a system font and a blank hero offline.
        runtimeCaching: [
          {
            // Supabase GETs were cached for 24 HOURS behind a 5-second network
            // timeout. On any connection slower than that — venue wifi, the
            // case this product keeps designing around — hydration was served a
            // copy up to a day old, and mergeCloudWithLocal then treated that
            // stale row as the authoritative cloud side of a last-write-wins
            // comparison. This is user data, not an asset: a few minutes is the
            // most that is defensible.
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // The self-hosted fonts and the hero footage, cached at runtime
            // rather than precached, so a first visit is not made to wait for
            // 2 MB of video before the page is usable.
            urlPattern: /\/(fonts|hero|shots)\/.*\.(ttf|woff2?|mp4|jpe?g|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kochav-media',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
