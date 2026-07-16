-- Add public token columns to the events table.
-- Each token is a stable UUID used as a public URL key for one page type.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_token    text,
  ADD COLUMN IF NOT EXISTS invite_token  text,
  ADD COLUMN IF NOT EXISTS gift_token    text,
  ADD COLUMN IF NOT EXISTS hostess_token text;

-- Unique constraint so two events can't share the same token
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rsvp_token    ON public.events (rsvp_token) WHERE rsvp_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_invite_token  ON public.events (invite_token) WHERE invite_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_gift_token    ON public.events (gift_token) WHERE gift_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_hostess_token ON public.events (hostess_token) WHERE hostess_token IS NOT NULL;

-- ── RSVP responses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsvp_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_name   text        NOT NULL,
  phone        text,
  attending    boolean     NOT NULL,
  guests_count integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rsvp_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can submit an RSVP (public form — no auth required)
CREATE POLICY "rsvp_public_insert" ON public.rsvp_responses
  FOR INSERT WITH CHECK (true);

-- Only the event owner can read RSVPs for their events
CREATE POLICY "rsvp_owner_select" ON public.rsvp_responses
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );

-- ── Gift transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gifts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  donor_name            text        NOT NULL,
  amount                integer     NOT NULL,  -- ILS in agorot (÷100 to display)
  message               text,
  stripe_payment_intent text,
  paid                  boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a gift (public gift form — Stripe webhook marks paid=true later)
CREATE POLICY "gifts_public_insert" ON public.gifts
  FOR INSERT WITH CHECK (true);

-- Paid gifts are visible to everyone (gift wall)
CREATE POLICY "gifts_wall_select" ON public.gifts
  FOR SELECT USING (paid = true);

-- Event owner can see all gifts (paid and pending) for their events
CREATE POLICY "gifts_owner_select" ON public.gifts
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );
