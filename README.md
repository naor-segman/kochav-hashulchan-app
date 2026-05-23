# כוכב השולחן – Kochav Hashulchan

Premium Hebrew RTL automatic seating arrangement web app for Israeli events.

**Supported events:** חתונה · בר/בת מצווה · ברית · חינה · אירועי חברה

---

## Tech stack

| Layer       | Technology             |
|-------------|------------------------|
| Framework   | React 18               |
| Build tool  | Vite 8                 |
| Styling     | CSS Modules + CSS vars |
| Font        | Heebo (Google Fonts)   |
| Persistence | LocalStorage           |
| Hosting     | Netlify                |

---

## Getting started

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run preview   # preview production build locally
```

---

## Project structure

```
src/
  components/   # Reusable UI components
  screens/      # Page-level views
  hooks/        # Custom React hooks
  logic/        # Business logic & algorithms
  utils/        # Pure helper functions
  styles/       # Global CSS system (tokens, reset, utilities)
  data/         # Constants and static data
```

---

## Deployment

Netlify auto-deploys from the `main` branch.
Config: `netlify.toml` — build command: `npm run build`, publish dir: `dist`.

---

See `CLAUDE.md` for full development rules and architecture documentation.
