import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

function mapPublicEvent(data) {
  return {
    cloudId:          data.id,
    name:             data.name              ?? "",
    type:             data.type              ?? "חתונה",
    date:             data.date              ?? "",
    venue:            data.venue             ?? "",
    brideName:        data.bride_name        ?? "",
    groomName:        data.groom_name        ?? "",
    celebrantName:    data.celebrant_name    ?? "",
    organizationName: data.organization_name ?? "",
    contactName:      data.contact_name      ?? "",
    ownerName:        data.owner_name        ?? "",
    giftBitPhone:     data.bit_phone         ?? "",
    giftPayboxLink:   data.paybox_link       ?? "",
    site: (data.site && typeof data.site === "object") ? data.site : null,
    rsvpToken:        data.rsvp_token        ?? null,
    giftToken:        data.gift_token        ?? null,
    inviteToken:      data.invite_token      ?? null,
  };
}

/**
 * Fetch the public event data for a given token type and token value.
 * Used by public pages (RSVP, invite, gift, hostess) that have no user auth.
 * Calls a SECURITY DEFINER function that requires a valid token and returns
 * only minimal public fields — anonymous callers cannot read the events table
 * directly, so cross-event enumeration is impossible.
 *
 * @param {"rsvp"|"invite"|"gift"|"hostess"} tokenType
 * @param {string} token  — the UUID token from the URL
 * @returns {object|null} — local-shaped event object, or null if not found
 */
export async function fetchEventByToken(tokenType, token) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const { data, error } = await supabase.rpc("public_event_by_token", {
    token_type:  tokenType,
    token_value: token,
  });
  if (error || !data) return null;
  return mapPublicEvent(data);
}

/**
 * Fetch the hostess dataset (guest list + tables + seating map) by hostess
 * token. Guest phone numbers are never included — the SQL function returns
 * only id / name / count per guest.
 *
 * @param {string} token — the hostess UUID token from the URL
 * @returns {{ id, name, guests: [], tables: [], seating: {} }|null}
 */
export async function fetchHostessData(token) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const { data, error } = await supabase.rpc("hostess_data_by_token", {
    token_value: token,
  });
  if (error || !data) return null;
  return {
    cloudId: data.id,
    name:    data.name    ?? "",
    guests:  Array.isArray(data.guests) ? data.guests : [],
    tables:  Array.isArray(data.tables) ? data.tables : [],
    seating: (data.seating && typeof data.seating === "object") ? data.seating : {},
  };
}

/**
 * Fetch all RSVP responses for an event the current user owns.
 * Relies on the "rsvp_owner_select" RLS policy — anonymous or non-owner
 * callers get an empty list.
 *
 * @param {string} eventCloudId — Supabase events.id
 * @returns {object[]} responses, newest first
 */
export async function fetchRSVPResponses(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const { data, error } = await supabase
    .from("rsvp_responses")
    .select("id, guest_name, phone, attending, guests_count, status, companions, created_at")
    .eq("event_id", eventCloudId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Submit an RSVP response to the rsvp_responses table.
 */
export async function submitRSVP(eventCloudId, response) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  // status: "yes" | "no" | "maybe" — `attending` stays for backward compat.
  const status = response.status || (response.attending ? "yes" : "no");
  // Keep the party size for "yes" and "maybe" (both collect it); "no" is 0.
  const rawCount = status === "no" ? 0 : (response.guestsCount ?? 1);
  const companions = Array.isArray(response.companions)
    ? response.companions.map(c => (c || "").trim()).filter(Boolean).slice(0, 50)
    : [];
  const { error } = await supabase.from("rsvp_responses").insert({
    event_id:     eventCloudId,
    guest_name:   response.name,
    phone:        response.phone   || null,
    attending:    status === "yes",
    guests_count: Math.max(0, Math.min(50, rawCount)),
    status,
    companions,
  });
  if (error) throw error;
}

/**
 * Submit a gift to the gifts table (pending payment).
 */
export async function submitGift(eventCloudId, gift) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("gifts").insert({
    event_id:   eventCloudId,
    donor_name: gift.donorName,
    amount:     Math.round(gift.amountILS * 100),
    message:    gift.message || null,
    paid:       false,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

/**
 * Fetch the public gift wall (blessings only — no amounts) by gift token.
 * Realtime is not used here: RLS hides unpaid gift rows from anon SELECT, so
 * postgres_changes would never deliver them. Callers poll this instead.
 *
 * @param {string} token — the gift UUID token from the URL
 * @returns {object[]} [{ id, donor_name, message, created_at }], newest first
 */
export async function fetchGiftWall(token) {
  if (!isSupabaseConfigured || !supabase || !token) return [];
  const { data, error } = await supabase.rpc("gift_wall_by_token", {
    token_value: token,
  });
  if (error || !Array.isArray(data)) return [];
  return data;
}

// ── Collaborative guest list ──────────────────────────────────────────────────

/** Minimal event info for the public collab form (name + side sources). */
export async function fetchCollabEvent(token) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const { data, error } = await supabase.rpc("collab_event_by_token", { token_value: token });
  if (error || !data) return null;
  return {
    cloudId:    data.id,
    name:       data.name       ?? "",
    type:       data.type       ?? "חתונה",
    brideName:  data.bride_name  ?? "",
    groomName:  data.groom_name  ?? "",
    coupleType: data.couple_type ?? "bride-groom",
    sideLabels: (data.side_labels && typeof data.side_labels === "object") ? data.side_labels : null,
  };
}

/** Anonymous submit of one guest to the collaborative list, keyed by the token. */
export async function submitGuestEntry(token, guest) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.rpc("submit_guest_by_token", {
    token_value: token,
    guest: {
      name:  guest.name,
      phone: guest.phone || null,
      side:  guest.side || null,
      group: guest.group || null,
      count: Number(guest.count) || 1,
      submittedBy: guest.submittedBy || null,
    },
  });
  if (error) throw error;
}

/** Host: read guest submissions for an owned event (RLS-guarded). */
export async function fetchGuestSubmissions(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const { data, error } = await supabase
    .from("guest_submissions")
    .select("id, name, phone, side, guest_group, guests_count, submitted_by, imported, created_at")
    .eq("event_id", eventCloudId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Host: mark a submission as imported so it isn't offered again. */
export async function markSubmissionImported(id) {
  if (!isSupabaseConfigured || !supabase || !id) return;
  const { error } = await supabase.from("guest_submissions").update({ imported: true }).eq("id", id);
  if (error) throw error;
}

// ── Live collaborative guest table ────────────────────────────────────────────
// A shared, real-time table: family members read the whole list and add/edit/
// delete rows by token; the owner's app two-way-syncs it with the guest list.

/** Anon: read every row of the shared table for an event, by token. */
export async function fetchCollabGuests(token) {
  if (!isSupabaseConfigured || !supabase || !token) return [];
  const { data, error } = await supabase.rpc("collab_list_by_token", { token_value: token });
  if (error || !Array.isArray(data)) return [];
  return data;
}

/** Anon: insert or update one row (by shared id), by token. */
export async function upsertCollabGuest(token, row) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.rpc("collab_upsert_by_token", {
    token_value: token,
    row_data: {
      id:           row.id,
      name:         row.name ?? "",
      phone:        row.phone ?? "",
      side:         row.side ?? null,
      guest_group:  row.guest_group ?? row.group ?? null,
      guests_count: Number(row.guests_count ?? row.count) || 1,
      updated_by:   row.updated_by ?? null,
    },
  });
  if (error) throw error;
}

/** Anon: delete one row by id, by token. */
export async function deleteCollabGuest(token, id) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.rpc("collab_delete_by_token", { token_value: token, row_id: id });
  if (error) throw error;
}

/**
 * Subscribe to live changes on an event's shared table. Returns an unsubscribe
 * fn. `onChange` fires on any insert/update/delete with the raw payload.
 * Falls back to a no-op unsubscribe when Supabase isn't configured.
 */
let _collabChannelSeq = 0;
export function subscribeCollabGuests(eventId, onChange) {
  if (!isSupabaseConfigured || !supabase || !eventId) return () => {};
  // Unique channel name per subscriber — two components (the sync engine and the
  // hub) can watch the same event without colliding on one shared channel.
  const channel = supabase
    .channel(`collab:${eventId}:${++_collabChannelSeq}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "collab_guests", filter: `event_id=eq.${eventId}` },
      (payload) => onChange(payload),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Owner: read the shared table for an owned event (RLS-guarded, direct). */
export async function fetchCollabGuestsOwner(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const { data, error } = await supabase
    .from("collab_guests")
    .select("id, name, phone, side, guest_group, guests_count, updated_at, updated_by")
    .eq("event_id", eventCloudId);
  if (error) throw error;
  return data ?? [];
}

/** Owner: push one guest row into the shared table (app→table sync). */
export async function upsertCollabGuestOwner(eventCloudId, row) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return;
  const { error } = await supabase.from("collab_guests").upsert({
    id:           row.id,
    event_id:     eventCloudId,
    name:         row.name ?? "",
    phone:        row.phone ?? "",
    side:         row.side ?? null,
    guest_group:  row.guest_group ?? row.group ?? null,
    guests_count: Number(row.guests_count ?? row.count) || 1,
    updated_at:   new Date().toISOString(),
  });
  if (error) throw error;
}

/** Owner: delete rows from the shared table by id (app→table sync). */
export async function deleteCollabGuestsOwner(eventCloudId, ids) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId || !ids?.length) return;
  const { error } = await supabase.from("collab_guests").delete().eq("event_id", eventCloudId).in("id", ids);
  if (error) throw error;
}
