# QA scripts

Browser-driven checks written during the 27–28.7 audit and design work. They
lived in a session scratchpad under `/tmp`, which is wiped when a session ends —
they are in the repo now so the next session (or the next person) does not have
to rewrite them.

## Running them

A dev server must be up first:

```bash
npx vite --port 5188 --host 127.0.0.1
```

Then, from the repo root:

```bash
node qa/qa-full.mjs     # 48 routes x mobile+desktop: blank pages, overflow, a11y, JS errors
node qa/flows.mjs       # 25 driven flows — clicks things and reads the result back out of localStorage
node qa/contrast.mjs    # samples rendered pixels and computes WCAG ratios
node qa/cssmod.mjs      # finds styles.X referenced from JSX but never defined in the .module.css
node qa/focus.mjs       # tabs through a screen and reports any control with no visible focus ring
node qa/shot.mjs "/app,/events/e1/seating" tag 1180   # screenshots to qa/shots/
node qa/cap.mjs         # captures the product screenshots used on the landing page
node qa/palette.mjs     # renders the same screens under several palettes, side by side
```

## Two things that will bite you

**Chromium and the proxy.** The sandbox has Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and every script launches
it with `args:['--no-proxy-server']` — without that flag localhost is routed
through the agent proxy and every request fails. Playwright itself is resolved
via `createRequire('/home/user/kochav-hashulchan-app/')` because these scripts
run from outside the package.

**Horizontal overflow: do not use `scrollWidth`.** An element that scrolls
internally inflates `scrollWidth` on every one of its ancestors, so a nav with
its own scroller makes the whole page look broken. Every honest check here does
`window.scrollTo(9999, 0)` and then asks whether `window.scrollX` actually
moved. A false positive from the old method once sent a whole afternoon into
"fixing" CSS that was correct.

## Why the flow script reads localStorage

`flows.mjs` never asserts on what rendered. It clicks, waits for the 1500ms
sync debounce, then reads `kochav_hashulchan_v1` back out and asserts on the
stored value. A screen can paint a guest perfectly and still not have saved
them; only the storage read catches that.
