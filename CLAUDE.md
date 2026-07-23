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
- **Admin panel**: Isolated subtree at `src/admin/` — lazy-loaded, never imported into the customer bundle
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
- Do **not** use the new semantic token system (`--color-gold-*`, `--font-size-*`, `--space-*`) — it exists in tokens.css but is unused dead code.
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
- `seating.js` is marked "V1 — copied from legacy". The algorithm works but has no tests. Do not refactor without adding tests first.
- Feature gates in `featureGates.js` are **soft (client-side only)**. Server-side RLS enforcement is planned but not implemented.
- `setStorageAdapter()` in `storage.js`, and `isLocalNewer()` / `isSynced()` in `cloudSync.js` are dead code — implemented but never called. Do not wire them up without a clear plan.
