# Admin Setup Guide — Kochav Hashulchan

Step-by-step instructions for connecting the `/admin` area to a real Supabase project.

> **Customer app is unaffected.** The `/` and `/events/*` routes use localStorage only.
> Nothing in this guide touches customer data, routing, or seating logic.

---

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier is fine for Phase 1)
- Access to the Netlify project dashboard (for production deployment)
- The repository cloned locally with `npm install` already run

---

## Step 1 — Create a Supabase project

1. Log in to [supabase.com](https://supabase.com) and click **New project**.
2. Fill in:
   - **Name:** `kochav-hashulchan` (or any name you like)
   - **Database password:** choose a strong password and save it somewhere safe
   - **Region:** pick the region closest to your users (e.g. `eu-central-1` for Israel)
3. Click **Create new project** and wait ~2 minutes for provisioning.

---

## Step 2 — Copy your API credentials

1. In your new project, go to **Project Settings → API** (left sidebar).
2. Copy two values:

   | What you need | Where to find it | Env var name |
   |---|---|---|
   | Project URL | **Project URL** box | `VITE_SUPABASE_URL` |
   | Anon / public key | **Project API Keys → anon public** | `VITE_SUPABASE_ANON_KEY` |

   The anon key is safe to expose in the browser — it is restricted by Row Level Security.
   **Never use the `service_role` key in the frontend.**

---

## Step 3 — Add env vars locally

1. In the project root, copy the example file:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in your real values:

   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. `.env.local` is gitignored — it will never be committed.

4. Restart the dev server if it was already running:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:5173/admin/login` — the yellow "not configured" banner should be gone.

---

## Step 4 — Run the SQL migration

The migration file is at `supabase/migrations/20260524000000_admin_foundation.sql`.
It creates the `profiles`, `events`, `templates`, and `subscriptions` tables with full RLS.

**Option A — Supabase Dashboard (easiest)**

1. In your Supabase project, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/migrations/20260524000000_admin_foundation.sql` in your editor,
   copy the entire contents, and paste into the SQL Editor.
4. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
5. You should see `Success. No rows returned` for each statement.

**Option B — Supabase CLI**

```bash
# Install the CLI if you don't have it
npm install -g supabase

# Link to your project (get the project ref from Project Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
supabase db push
```

---

## Step 5 — Create the first admin user

The app has **no self-registration**. You must create your user manually.

1. In Supabase Dashboard, go to **Authentication → Users** (left sidebar).
2. Click **Add user → Create new user**.
3. Enter your email and a strong password.
4. Click **Create user**.

This user can now log in at `/admin/login`, but they will have role `user` until Step 6.

---

## Step 6 — Promote your account to admin

When you logged in (or after creating the user above), the `on_auth_user_created`
trigger automatically inserted a row into `public.profiles`.

Now promote that row to admin:

1. In Supabase Dashboard, open **SQL Editor**.
2. Run:

   ```sql
   UPDATE public.profiles
   SET    role = 'admin', updated_at = now()
   WHERE  email = 'YOUR_EMAIL';   -- e.g. 'naor.segman@gmail.com'
   ```

3. You should see `1 row affected`. If you see `0 rows affected`, the trigger hasn't
   run yet — log in at `/admin/login` first (this fires the trigger), then re-run the UPDATE.

4. Refresh the admin dashboard — your email address will appear in the top bar.

---

## Step 7 — Add env vars to Netlify (production)

The `.env.local` file is only for local development. For Netlify:

1. Go to your site in the **Netlify Dashboard**.
2. Navigate to **Site configuration → Environment variables**.
3. Click **Add a variable** for each:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxxxxxxxxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

4. Set **Scopes** to `Builds` (or "All scopes").
5. Click **Save**.
6. Trigger a new deploy: **Deploys → Trigger deploy → Deploy site**.

After the deploy, visit `https://your-site.netlify.app/admin/login` — it should
show the login form without the yellow setup banner.

---

## Verification checklist

After completing all steps, confirm:

- [ ] `/admin/login` shows the login form with no yellow "not configured" banner
- [ ] You can sign in with your email and password
- [ ] The admin dashboard shows your email in the top bar
- [ ] Logging out redirects back to `/admin/login`
- [ ] The customer app (`/`) still works normally — events load from localStorage
- [ ] No Supabase errors appear in the browser console

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Yellow "not configured" banner | Env vars missing or dev server not restarted | Check `.env.local`, restart `npm run dev` |
| "Invalid login credentials" | Wrong password or user doesn't exist | Re-check Authentication → Users in Supabase |
| "0 rows affected" on admin promote | Profile row not created yet | Log in at `/admin/login` first, then re-run the UPDATE |
| Dashboard shows "—" for all stats | Expected — Phase 1 placeholder | Stats become live in Phase 2 once queries are wired |
| Netlify still shows banner after deploy | Env vars not saved or deploy not triggered | Re-check Netlify env vars, trigger a new deploy |

---

## Security notes

- The `anon` key is intentionally public — all data access is governed by **Row Level Security** policies in the migration.
- No customer data is sent to Supabase. The customer app remains entirely localStorage-based.
- Admin accounts can only be created manually (Supabase Dashboard → Authentication → Users). There is no public registration endpoint.
- The `service_role` key (also shown in Supabase settings) bypasses RLS entirely — never add it to `.env.local` or Netlify frontend env vars.

---

*See `docs/admin-schema.md` for the full database schema reference.*
