-- =============================================================================
-- Kochav Hashulchan — FULL DATABASE SETUP (fresh Supabase project)
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Combines every migration in order. Safe to re-run (IF NOT EXISTS guards
-- where possible; CREATE TABLE statements assume an empty schema).
-- =============================================================================

-- ═══ 1. Helper: is_admin() ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ═══ 2. profiles ═════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  stripe_customer_id text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: users read own"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: users update own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles: admins read all"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: admins update all" ON public.profiles;

CREATE POLICY "profiles: users read own"
  ON public.profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles: users update own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "profiles: admins read all"
  ON public.profiles FOR SELECT USING (public.is_admin());

CREATE POLICY "profiles: admins update all"
  ON public.profiles FOR UPDATE USING (public.is_admin());

-- Backfill: users who registered BEFORE this trigger existed get a profile row.
INSERT INTO public.profiles (id, email)
SELECT u.id, u.email FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ═══ 3. events ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT '',
  type        text        NOT NULL DEFAULT 'חתונה',
  date        text,
  venue       text,
  payload     jsonb       NOT NULL DEFAULT '{}',
  guest_count integer     NOT NULL DEFAULT 0,
  table_count integer     NOT NULL DEFAULT 0,
  seated_pct  numeric(5, 2) NOT NULL DEFAULT 0,
  version     integer     NOT NULL DEFAULT 1,
  rsvp_token    text,
  invite_token  text,
  gift_token    text,
  hostess_token text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_id_idx    ON public.events (user_id);
CREATE INDEX IF NOT EXISTS events_updated_at_idx ON public.events (updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rsvp_token    ON public.events (rsvp_token)    WHERE rsvp_token    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_invite_token  ON public.events (invite_token)  WHERE invite_token  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_gift_token    ON public.events (gift_token)    WHERE gift_token    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_hostess_token ON public.events (hostess_token) WHERE hostess_token IS NOT NULL;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events: users read own"    ON public.events;
DROP POLICY IF EXISTS "events: users insert own"  ON public.events;
DROP POLICY IF EXISTS "events: users update own"  ON public.events;
DROP POLICY IF EXISTS "events: users delete own"  ON public.events;
DROP POLICY IF EXISTS "events: admins read all"   ON public.events;
DROP POLICY IF EXISTS "events: admins update all" ON public.events;
DROP POLICY IF EXISTS "events: public token read" ON public.events;

CREATE POLICY "events: users read own"
  ON public.events FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "events: users insert own"
  ON public.events FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "events: users update own"
  ON public.events FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "events: users delete own"
  ON public.events FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "events: admins read all"
  ON public.events FOR SELECT USING (public.is_admin());

CREATE POLICY "events: admins update all"
  ON public.events FOR UPDATE USING (public.is_admin());

-- ═══ 4. templates ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  type        text        NOT NULL DEFAULT 'חתונה',
  description text,
  payload     jsonb       NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  icon        text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_sort_order_idx
  ON public.templates (sort_order ASC, created_at ASC);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates: authenticated read active" ON public.templates;
DROP POLICY IF EXISTS "templates: admins manage"             ON public.templates;
DROP POLICY IF EXISTS "templates: anon read active"          ON public.templates;

CREATE POLICY "templates: authenticated read active"
  ON public.templates FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "templates: admins manage"
  ON public.templates FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "templates: anon read active"
  ON public.templates FOR SELECT TO anon
  USING (is_active = true);

-- ═══ 5. subscriptions ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  plan        text        NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free', 'pro', 'enterprise')),
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'trialing', 'cancelled', 'expired')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  stripe_customer_id      text,
  stripe_subscription_id  text UNIQUE,
  stripe_price_id         text,
  current_period_end      timestamptz,
  is_manually_managed     boolean NOT NULL DEFAULT false,
  payment_past_due        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subs_stripe_customer_idx  ON public.subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subs_stripe_sub_idx       ON public.subscriptions (stripe_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: users read own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions: admins manage"  ON public.subscriptions;

CREATE POLICY "subscriptions: users read own"
  ON public.subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "subscriptions: admins manage"
  ON public.subscriptions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═══ 6. app_settings ═════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name   text        NOT NULL DEFAULT 'כוכב השולחן',
  support_email  text,
  event_defaults jsonb       NOT NULL DEFAULT '{}',
  feature_flags  jsonb       NOT NULL DEFAULT '{}',
  system_notes   text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings: admins only" ON public.app_settings;

CREATE POLICY "app_settings: admins only"
  ON public.app_settings FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (id, product_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'כוכב השולחן')
ON CONFLICT (id) DO NOTHING;

-- ═══ 7. rsvp_responses ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rsvp_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_name   text        NOT NULL,
  phone        text,
  attending    boolean     NOT NULL,
  guests_count integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rsvp_guest_name_nonempty  CHECK (char_length(guest_name) > 0),
  CONSTRAINT ck_rsvp_guest_name_len       CHECK (char_length(guest_name) <= 200),
  CONSTRAINT ck_rsvp_phone_len            CHECK (phone IS NULL OR char_length(phone) <= 20),
  CONSTRAINT ck_rsvp_guests_count_range   CHECK (guests_count >= 0 AND guests_count <= 50)
);

ALTER TABLE public.rsvp_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rsvp_public_insert" ON public.rsvp_responses;
DROP POLICY IF EXISTS "rsvp_owner_select"  ON public.rsvp_responses;

CREATE POLICY "rsvp_public_insert" ON public.rsvp_responses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "rsvp_owner_select" ON public.rsvp_responses
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );

-- ═══ 8. gifts ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.gifts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  donor_name            text        NOT NULL,
  amount                integer     NOT NULL,
  message               text,
  stripe_payment_intent text,
  paid                  boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_gift_donor_name_nonempty CHECK (char_length(donor_name) > 0),
  CONSTRAINT ck_gift_donor_name_len      CHECK (char_length(donor_name) <= 200),
  CONSTRAINT ck_gift_message_len         CHECK (message IS NULL OR char_length(message) <= 500),
  CONSTRAINT ck_gift_amount_range        CHECK (amount >= 5000 AND amount <= 10000000)
);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gifts_public_insert" ON public.gifts;
DROP POLICY IF EXISTS "gifts_wall_select"   ON public.gifts;
DROP POLICY IF EXISTS "gifts_owner_select"  ON public.gifts;

CREATE POLICY "gifts_public_insert" ON public.gifts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "gifts_owner_select" ON public.gifts
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );

-- ═══ 9. Public-page functions (token-gated, no table-level anon access) ══════

CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink')
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND CASE token_type
      WHEN 'rsvp'    THEN e.rsvp_token    = token_value
      WHEN 'invite'  THEN e.invite_token  = token_value
      WHEN 'gift'    THEN e.gift_token    = token_value
      WHEN 'hostess' THEN e.hostess_token = token_value
      ELSE false END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.hostess_data_by_token(token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name,
    'guests', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', g->>'id', 'name', g->>'name', 'count', COALESCE((g->>'count')::int, 1)))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests','[]'::jsonb)) g), '[]'::jsonb),
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t->>'id', 'name', t->>'name'))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables','[]'::jsonb)) t), '[]'::jsonb),
    'seating', COALESCE(e.payload->'seating','{}'::jsonb))
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.gift_wall_by_token(token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', g.id, 'donor_name', g.donor_name, 'message', g.message, 'created_at', g.created_at)
      ORDER BY g.created_at DESC)
    FROM public.gifts g WHERE g.event_id = e.id), '[]'::jsonb)
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND e.gift_token = token_value
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.gift_wall_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_wall_by_token(text) TO anon, authenticated;

-- ═══ 10. Promote the founder account to admin ════════════════════════════════

UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE email = 'naor.segman@gmail.com';
