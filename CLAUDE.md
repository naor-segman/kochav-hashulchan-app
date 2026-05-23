# CLAUDE.md – Kochav Hashulchan Production Rules

## Project identity
**Kochav Hashulchan** (כוכב השולחן) – Premium Hebrew RTL automatic seating arrangement app for Israeli events (weddings, bar/bat mitzvahs, britot, henna, corporate).

This project is entirely independent. Never reference, import, or copy from any other repository.

---

## Stack
- React 18 + Vite
- CSS Modules for component styles
- Global CSS variables (tokens) for all design decisions
- LocalStorage for persistence (no backend in Phase 1)

---

## Architecture rules

```
src/
  components/   # Reusable UI primitives (Button, Card, Modal, …)
  screens/      # Full-page views (HomeScreen, EventScreen, SeatingScreen, …)
  hooks/        # Custom React hooks (useLocalStorage, useGuests, …)
  logic/        # Pure business logic and algorithms (seating solver, etc.)
  utils/        # Pure helper functions (formatting, validation, …)
  styles/       # Global CSS: tokens.css, reset.css, utilities.css, global.css
  data/         # Static data, constants, type schemas
```

### Naming conventions
- Components: `PascalCase.jsx` + `PascalCase.module.css`
- Hooks: `useCamelCase.js`
- Logic / utils: `camelCase.js`
- Screens: `PascalCaseScreen.jsx`

---

## CSS rules
- **All** design values (colors, spacing, radii, shadows, fonts) come from `src/styles/tokens.css` CSS variables.
- Use CSS Modules (`*.module.css`) for component-scoped styles.
- Use utility classes from `utilities.css` sparingly for layout only.
- Never use inline styles unless absolutely necessary.
- RTL is enforced globally via `dir="rtl"` on `<html>` and `direction: rtl` in the reset.
- Use logical CSS properties (`margin-inline`, `padding-inline-start`, etc.) for RTL correctness.

---

## Workflow rules
1. Work step-by-step only.
2. Never rewrite broad sections unnecessarily.
3. Never make unrelated changes in the same commit.
4. Always explain what you are about to do before editing.
5. Always verify the build passes (`npm run build`) after any edit.
6. Commit only focused, logical steps with clear messages.
7. Never create fake/demo logic without explicitly saying so.
8. Never touch unrelated files.

---

## Commit message format
```
type(scope): short description

Examples:
feat(screens): add HomeScreen layout
fix(css): correct RTL padding on GuestCard
chore(deps): upgrade vite to 8.x
```

---

## Prohibited
- No hardcoded colors, spacing, or font sizes outside of `tokens.css`.
- No `!important` unless overriding a third-party library.
- No `console.log` left in production code.
- No copying from UNICA or any other project.
- No pushing to `main` directly.

---

## Future phases (do not implement yet)
- Phase 2: Guest management CRUD
- Phase 3: Table management + drag-and-drop seating canvas
- Phase 4: AI seating optimization
- Phase 5: Multi-event dashboard + SaaS auth
