import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Emit one real HTML document per indexable route, plus sitemap.xml.
 * Checklist 87 (the SEO gap) and 52.
 *
 * Measured in a browser on 10.9: /home, /pricing and all six /services/* served
 * the SAME <title>, the SAME description and no canonical — one index.html, as
 * every SPA does. Six landing pages built to be found on "סידורי הושבה" and
 * "אישורי הגעה" looked to Google like one page, and a WhatsApp preview of any of
 * them showed the generic site title.
 *
 * WHY STATIC FILES AND NOT AN EDGE FUNCTION. netlify/edge-functions/invite-og.js
 * does this at the edge, and it has to — the invite title depends on a token and
 * a database row. These eight routes are FIXED, so the correct document can be
 * written at build time, which costs nothing per request, needs no Supabase
 * round trip, cannot fail at runtime, and — the reason that decides it — never
 * touches the Deno bundler, the one stage of the deploy that does not run
 * locally and that killed every build of this branch for eleven days.
 *
 * Netlify's `/*` → `/index.html` rule has no `force`, so a real file at
 * dist/services/seating/index.html wins over the fallback and the crawler gets a
 * correct <head> without running any JavaScript.
 *
 * It is `enforce: 'post'`, which puts it after vite-plugin-pwa — deliberately.
 * Workbox's globPatterns match '**\/*.html', so running first would precache
 * eight near-identical copies of index.html into every installed app.
 */
function seoPages() {
  let outDir = 'dist'
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return {
    name: 'revaya-seo-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { outDir = config.build.outDir },
    async closeBundle() {
      const { SEO_PAGES, pageTitle, pageCanonical } = await import('./src/data/seo.js')
      const shell = await readFile(join(outDir, 'index.html'), 'utf8')

      for (const page of SEO_PAGES) {
        const t = esc(pageTitle(page))
        const d = esc(page.description)
        const c = esc(pageCanonical(page))

        /* Replacement FUNCTIONS, never strings. String.prototype.replace expands
           `$&`, "$`", `$'` and `$1` inside a string replacement AFTER escaping —
           that is bug class 8 in CLAUDE.md, and it is how invite-og.js let a
           host-controlled name pull raw page HTML into an attribute. Nothing
           here is host-controlled today, but the shape is the bug. */
        let html = shell
          .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${t}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/i, (_m, a, b) => a + d + b)
          .replace(/(<meta property="og:title" content=")[^"]*(")/i, (_m, a, b) => a + t + b)
          .replace(/(<meta property="og:description" content=")[^"]*(")/i, (_m, a, b) => a + d + b)
          .replace(/(<meta name="twitter:title" content=")[^"]*(")/i, (_m, a, b) => a + t + b)
          .replace(/(<meta name="twitter:description" content=")[^"]*(")/i, (_m, a, b) => a + d + b)

        // Canonical and og:url are ADDED — index.html carries neither, which is
        // half of what the measurement found.
        html = html.replace(/<\/head>/i, () =>
          `  <link rel="canonical" href="${c}" />\n` +
          `    <meta property="og:url" content="${c}" />\n` +
          `  </head>`)

        const file = page.path === '/'
          ? join(outDir, 'index.html')
          : join(outDir, page.path, 'index.html')
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, html)
      }

      const lastmod = new Date().toISOString().slice(0, 10)
      const urls = SEO_PAGES
        .filter(p => p.sitemap !== false)
        .map(p => `  <url>\n    <loc>${esc(pageCanonical(p))}</loc>\n` +
                  `    <lastmod>${lastmod}</lastmod>\n` +
                  `    <priority>${p.priority || '0.5'}</priority>\n  </url>`)
        .join('\n')
      await writeFile(join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)

      console.log(`\nseo-pages  ${SEO_PAGES.length} documents + sitemap.xml`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  test: {
    // A background agent may hold a git worktree under .claude/, which is INSIDE
    // the repo — and Vitest's default exclude covers only node_modules and .git,
    // so it globbed a second copy of every test and reported 98 files / 1884
    // tests. A doubled count is not cosmetic: it hides the real one, and it made
    // two unrelated failures appear out of a tree that was green.
    exclude: ["**/node_modules/**", "**/.git/**", "**/.claude/**", "**/dist/**", "legacy/**"],
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
        name: 'רוויה — סידור הושבה',
        short_name: 'רוויה',
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
    seoPages(),
  ],
})
