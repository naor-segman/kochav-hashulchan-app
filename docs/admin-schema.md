# Admin Database Schema — Kochav Hashulchan

> **Phase 1 — Admin Foundation**
> The customer app still uses localStorage exclusively.
> This schema prepares the database for future cloud sync (Phase 3+).

---

## Tables

### `public.profiles`

One row per Supabase Auth user. Created automatically on signup via trigger.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | — | References `auth.users(id)` |
| `email` | text | — | Copied from Auth on creation |
| `full_name` | text | null | Optional display name |
| `role` | text | `'user'` | `'user'` \| `'admin'` |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**RLS:**
- Users: `SELECT` and `UPDATE` own row (cannot self-promote `role`)
- Admins: `SELECT` and `UPDATE` all rows

---

### `public.events`

Cloud mirror of app localStorage events. `payload` holds the complete JSON object.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `user_id` | uuid FK | — | References `profiles(id)` |
| `name` | text | `''` | Event display name |
| `type` | text | `'חתונה'` | חתונה \| בר מצווה \| ברית \| חינה \| חברה |
| `date` | text | null | ISO date string `'YYYY-MM-DD'` (text matches app schema) |
| `venue` | text | null | Venue name |
| `payload` | jsonb | `'{}'` | **Full app event JSON** — tables, guests, seating, constraints, … |
| `guest_count` | integer | `0` | Denormalised from payload for dashboard queries |
| `table_count` | integer | `0` | Denormalised from payload |
| `seated_pct` | numeric(5,2) | `0` | Percentage of guests seated (0–100) |
| `version` | integer | `1` | Matches app's `event.version` field |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**RLS:**
- Users: full CRUD on own events
- Admins: `SELECT` + `UPDATE` all events (no admin `DELETE` — preserve audit trail)

**Indexes:** `events_user_id_idx`, `events_updated_at_idx`

---

### `public.templates`

Admin-managed event templates. Future use: "Start from template" CTA in dashboard.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `name` | text | — | Template display name |
| `type` | text | `'חתונה'` | Event type this template targets |
| `description` | text | null | Short description for UI |
| `payload` | jsonb | `'{}'` | Seed data: `{ tables: [], default_constraints: [] }` |
| `is_active` | boolean | `true` | Hidden from users when false |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**RLS:**
- Authenticated users: `SELECT` active templates
- Admins: full `INSERT` / `UPDATE` / `DELETE`

---

### `public.subscriptions`

SaaS plan tracking. Phase 1 — structure only, no payment integration.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `user_id` | uuid FK | — | References `profiles(id)` |
| `plan` | text | `'free'` | `'free'` \| `'pro'` \| `'enterprise'` |
| `status` | text | `'active'` | `'active'` \| `'trialing'` \| `'cancelled'` \| `'expired'` |
| `started_at` | timestamptz | `now()` | |
| `expires_at` | timestamptz | null | null = no expiry |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**RLS:**
- Users: `SELECT` own row
- Admins: full management

**Index:** `subscriptions_user_id_idx`

---

## Helper function: `is_admin()`

Used in every admin RLS policy.

```sql
SELECT public.is_admin();  -- true if current user has role = 'admin'
```

`SECURITY DEFINER` + `STABLE` — bypasses RLS when querying `profiles` (prevents
policy recursion) and caches the result within a query.

---

## First-time setup

### 1. Run the migration

Paste `supabase/migrations/20260524000000_admin_foundation.sql` into
**Supabase Dashboard → SQL Editor** and run it, **or** use the Supabase CLI:

```bash
supabase db push
```

### 2. Log in once

Visit `/admin/login` and sign in with your email. This fires the
`on_auth_user_created` trigger and creates your profile row.

### 3. Promote yourself to admin

In **Supabase Dashboard → SQL Editor**:

```sql
UPDATE public.profiles
SET    role = 'admin', updated_at = now()
WHERE  email = 'YOUR_EMAIL';   -- e.g. 'naor.segman@gmail.com'
```

Only direct SQL access or an existing admin can promote accounts.

---

## Phase roadmap

| Phase | What gets wired |
|---|---|
| **1 (now)** | Schema only — admin auth, login screen, dashboard placeholder |
| **2** | Admin screens: users list, event viewer |
| **3** | Cloud sync: app writes events to Supabase on save |
| **4** | Templates: "start from template" CTA in customer dashboard |
| **5** | Subscriptions: plan enforcement, billing webhook |
