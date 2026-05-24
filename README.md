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

---

## Admin area

The `/admin/*` routes require a Supabase project. The customer app (`/`, `/events/*`) is
localStorage-only and has no Supabase dependency.

**Setup:**
1. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key.
2. Run the migration: `supabase/migrations/20260524000000_admin_foundation.sql`
3. Log in at `/admin/login` once to create your profile row.
4. Promote your account: `UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';`

See `docs/admin-schema.md` for the full schema reference.

---

See `CLAUDE.md` for full development rules and architecture documentation.
