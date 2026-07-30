import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
