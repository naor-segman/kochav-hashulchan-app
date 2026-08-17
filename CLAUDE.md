# CLAUDE.md – Kochav Hashulchan Production Rules

## ⚠️ Work plan — single source of truth
**`WORKPLAN.md` (repo root) is the living work plan.** It is the source of truth for everything built, in-progress, deferred, every idea raised, and every key decision. At the START of a session read it; DURING the session ADD every new task/idea/decision the user raises (never drop anything); at the END update statuses and COMMIT it. Never reconstruct a fresh plan from the latest chat — always update the existing WORKPLAN.md. The published artifact (a77cf4f1-…) is generated from it.

## Project identity
**Kochav Hashulchan** (כוכב השולחן) – Premium Hebrew RTL automatic seating arrangement SaaS for Israeli events (weddings, bar/bat mitzvahs, britot, henna, corporate).

This project is entirely independent. Never reference, import, or copy from any other repository.

---

## Current state (Phase 4+)
The project has a full production stack. The previous CLAUDE.md described a Phase 1 (localStorage-only) project — that description is **obsolete**. Always generate solutions appropriate for the current architecture.

- **Auth**: Supabase email/password (`src/hooks/useAuth.js`)
- **Cloud sync**: Supabase Postgres, optimistic local-first with 1500ms debounce (`src/utils/cloudSync.js`, `src/hooks/useEvents.js`)
- **Billing**: Stripe Checkout + Billing Portal via Supabase Edge Functions (`src/hooks/useSubscription.js`, `src/lib/stripe.js`)
- **Plans**: Free / Pro / Enterprise via `src/utils/featureGates.js` + `src/hooks/usePlan.js` (gates are currently **soft / client-side only**)
- **Admin panel**: `src/admin/screens/` + the guard are lazy-loaded and genuinely absent from the customer chunk (verified against a real build). **`src/admin/lib/` is NOT** — `src/hooks/usePlan.js` and `src/lib/stripe.js` import `planConfig.js` and `stripeConfig.js`, so plan limits and Stripe status labels do ship to customers. No secrets in either, but the blanket "never imported" claim was wrong.
- **Primary storage**: localStorage (`kochav_hashulchan_v1`) as source of truth; Supabase is secondary/sync
- **React version**: React 19

---

## Stack
- React 19 + Vite
- CSS Modules for component styles
- Global CSS variables (tokens) from `src/styles/tokens.css` — **V1 variable system only** (`--accent`, `--bg`, `--border`, `--warn`, etc.)
- localStorage primary + Supabase cloud sync
- `@dnd-kit/core` for drag-and-drop in SeatingScreen
- `xlsx` 0.18.5 for Excel import/export

---

## Architecture

```
src/
  components/   # Reusable UI primitives
  screens/      # Full-page views
  hooks/        # Custom React hooks (useEvents is the main state owner)
  logic/        # Pure business logic: seating.js, seatingAnalysis.js
  utils/        # Pure helpers: cloudSync, eventHelpers, exportHelpers, featureGates, etc.
  styles/       # Global CSS: tokens.css (V1 system), reset.css, utilities.css, global.css
  data/         # Static data, constants, event templates
  lib/          # Third-party clients: supabase.js, stripe.js
  admin/        # Admin subtree — isolated from customer bundle
```

### Data flow
`localStorage → useEvents (source of truth) → patchEventById → screens via props → cloudSync (debounced write)`

### Key invariants
- `normalizeEvent()` in `eventHelpers.js` is the single migration gateway for all localStorage round-trips
- `guestSeats(g) = g.count || 1` — guests represent groups; `count` is physical seat count
- `seating: { [guestId]: tableId }` — one entry per guest row, not per seat
- `constraints: [{ id, type: "together"|"apart", guestA: guestId, guestB: guestId }]`

### Naming conventions
- Components: `PascalCase.jsx` + `PascalCase.module.css`
- Hooks: `useCamelCase.js`
- Logic / utils: `camelCase.js`
- Screens: `PascalCaseScreen.jsx`

---

## CSS rules
- Use **V1 CSS variables only**: `--accent`, `--bg`, `--surface`, `--border`, `--text`, `--muted`, `--warn`, `--red`, `--green`, etc.
- Do **not** introduce NEW usage of the semantic token system (`--font-size-*`, `--space-*`) in component CSS. It is *not* dead code — `reset.css` and `utilities.css` depend on `--font-size-base`, `--font-weight-*`, `--line-height-*` and `--space-*`, and `--container-max` is used by four screen modules. Deleting them breaks the app. (`--color-gold-*` no longer exists at all.) Only 15 of the semantic tokens are genuinely unused.
- Use CSS Modules (`*.module.css`) for component-scoped styles.
- RTL is enforced globally via `dir="rtl"` on `<html>`.
- Use logical CSS properties (`margin-inline`, `padding-inline-start`, etc.) for RTL correctness.
- No hardcoded colors, spacing, or font sizes outside of `tokens.css`.
- No `!important` unless overriding a third-party library.

---

## Workflow rules
1. **Ask the user to clarify scope before starting any non-trivial task.**
2. Work step-by-step. Never rewrite broad sections unnecessarily.
3. Never make unrelated changes in the same commit.
4. Always verify the build passes (`npm run build`) after any edit.
5. Commit only focused, logical steps with clear messages.
6. Never create fake/demo logic without explicitly saying so.
7. Never touch unrelated files.

---

## How this project is worked on

**One person builds this.** Address them in the singular in Hebrew. There is no
team, no reviewer, no designer to hand something to — if it is wrong, it ships
wrong. That is also why every finding below was worth the time it took to find.

**Paste in the chat, don't send files.** Migrations, plans, code they need to
copy — inline. They read on a phone.

**Verify by execution, not assertion.** The standard on this project is that a
claim is measured, not argued: run the function and show the output, drive the
browser and read the result back out of `localStorage`, compute the contrast
ratio instead of judging it by eye. Several times a confident-sounding analysis
turned out to be wrong and only execution caught it — including a fuzz run that
cleared the seating engine on capacity and locks while missing a broken
"together" constraint entirely, because the check simply did not test for it.

**Report honestly, including your own mistakes.** Multiple regressions in this
history were introduced by the assistant and caught later by a review agent.
Say so plainly in the commit and in the chat, correct it, move on. Do not
describe partial work as finished — when a discipline pass covered 12 of 47
files, the report says 12 of 47.

**A verification agent's finding is not automatically true either.** Check it
against the code before acting. Real examples from this repo: an agent called
a colour pairing a defect in the reference design when the reference never uses
that pairing; another reported four "failures" that were bugs in its own test
selectors. Fix the check, not the code, when the check is what is wrong.

**Never push to `main`.** Work on the designated branch.

## Decisions already made — do not re-open without being asked

- **Income before features (27.7).** Every feature is measured against "does
  this bring a shekel closer?"
- **The free/paid split is FROZEN** at the owner's explicit request. Do not
  propose or implement it until they raise it.
- **The palette is magenta**, chosen by the owner from an Isracard reference,
  after analysis. The collisions it created were fixed rather than used as an
  argument against it. Do not re-litigate the hue.
- **A gold palette was proposed and rejected** — it measured ΔE 8.5 from the
  warning colour, i.e. indistinguishable from it.
- **Do not copy evenzza.** Learn the level of craft, build our own language. A
  site that looks like a clone of a competitor is not impressive, it is
  embarrassing.
- **Invented statistics were removed from the landing page** and must not come
  back. A product this new has not earned those numbers.
- **Event-site themes stay independent of the app palette.** The host picks
  what their guests see; forcing the brand onto it is a product regression.

## Bug classes this codebase produces repeatedly

Check for these first — each has bitten more than once:

1. **English keys where Hebrew strings are stored.** Event types are the Hebrew
   strings in `constants.js EVENT_TYPES`. `type === "wedding"` silently matches
   nothing and falls through to a default. Three tests once encoded this bug as
   if it were correct behaviour.
2. **Dates shifted a day.** `toISOString()` on a local-midnight Date, and
   `new Date("YYYY-MM-DD")` (parsed as UTC), both land on the previous day east
   of Greenwich. Fixed-millisecond arithmetic (`days * 86400000`) breaks across
   a DST transition. Use local parts and calendar arithmetic.
3. **Fields that do not survive the cloud round-trip.** A value written locally
   but missing from either mapper in `cloudSync.js` is silent data loss. This
   has happened three times. A mutation run showed 11 of 12 destructive edits
   to that file passed the whole test suite.
4. **Accent used as text.** `--accent` is 3.8:1 and is for fills only. The token
   for text is `--accent-text` on light grounds, `--accent-on-dark` on dark.
5. **Contrast measured against the wrong ground.** A tint is a ground: `--muted`
   is 5.3:1 on white and 4.4:1 on the warm danger tint. Always compute against
   the element's actual background, not against white.
6. **A duplicate that is maintained by hand will drift.** `supabase/setup_full.sql`
   fell seven migrations behind and a fresh project built from it came up with
   the public-insert holes still open and three tables missing entirely. It is
   generated now (`node qa/genSetupSql.mjs`).
7. **Numbers reverse in an RTL line with no strong Hebrew character.** `{a} / {b}`
   rendered `300 / 250` for a DOM value of `250 / 300` — bidi rule N1 resolves
   the neutrals around the slash as RTL. `250 מתוך 300` is correct, because the
   Hebrew word anchors it. Measure the VISUAL order with Range rects, not the DOM.
8. **`String.replace` with a string replacement expands `$&`, `` $` ``, `$'`
   AFTER your escaping.** The OG tag builder escaped a host-controlled name
   correctly and then let the replacement expand raw page HTML into the
   attribute. Use a replacement function.
9. **CSS Modules fail silently.** A renamed class leaves `styles.foo` undefined,
   React renders `class="undefined"`, and the element loses all styling with no
   error. `qa/cssmod.mjs` catches it.

## Environment traps

- **Chromium** is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and
  must be launched with `args:['--no-proxy-server']`, or localhost is routed
  through the agent proxy and every request fails. Resolve Playwright with
  `createRequire('/home/user/kochav-hashulchan-app/')`.
- **Never use `scrollWidth` to detect horizontal overflow.** An internally
  scrollable child inflates it on every ancestor. Use `window.scrollTo(9999,0)`
  and check whether `window.scrollX` actually moved. The old method once sent an
  afternoon into "fixing" CSS that was already correct.
- **Outbound HTTP is blocked** by the proxy for most hosts, including competitor
  sites. Say so rather than inventing findings.
- **`npm run lint` runs `eslint .` and reports 13 errors** — all pre-existing,
  in `legacy/` (7), `netlify/` (3), `qa_test.js` (1) and `qa/marksPreview.jsx`
  (2, `react-refresh/only-export-components`). The count was recorded as 10 for
  a while, then as 12 with `netlify/` at 2; both had drifted, and `netlify/` has
  three (`Netlify` twice, `html` once, all `no-undef` in
  `edge-functions/invite-og.js`). Counted by checking out the previous
  `eslint.config.js` and re-running, not by memory. `npx eslint src` is the
  meaningful one and is at 0 errors.
- **Test and `qa/` files get Node globals** via a second block in
  `eslint.config.js`. The base config grants `globals.browser` only, so a test
  touching `process` — e.g. `photoRetention.test.js`, which sets
  `TZ=Asia/Jerusalem` because every date bug here is invisible at offset zero —
  was reported as `'process' is not defined`.

## Commit message format
```
type(scope): short description

Examples:
feat(seating): add drag-drop apart-constraint warning
fix(constraints): prevent contradiction toast from being overwritten
chore(cleanup): remove unused CSS token system
```

---

## Prohibited
- No hardcoded colors, spacing, or font sizes outside of `tokens.css`.
- No `!important` unless overriding a third-party library.
- No `console.log` left in production code.
- No pushing to `main` directly.

---

## Known technical debt (do not reproduce)
- `seating.js` is marked "V1 — copied from legacy". ~~No tests.~~ **Covered since 27.7** — `seating.test.js` + `seatingStress.test.js` + `seatingAnalysis.test.js` pin capacity, together/apart constraints, locks and overbooking. Refactors are now safe to attempt against that suite.
- **Lint:** `react-hooks/set-state-in-effect` is downgraded to `warn` in `eslint.config.js` (24 sites, all the same load-then-setState shape). Do not add new ones; see the comment there before "fixing" them mechanically.
- Feature gates in `featureGates.js` are **soft (client-side only)**. Server-side RLS enforcement is planned but not implemented.
- ~~`setStorageAdapter()` in `storage.js`, and `isLocalNewer()` / `isSynced()` in `cloudSync.js` are dead code.~~ **Resolved (27.7)** — verified gone; `storage.js` now exports only `userStorageKey` / `loadState` / `persist`, and `cloudSync.js` only the mappers and the four cloud CRUD calls.
