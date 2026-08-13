import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { toSeatIndex } from "./arrival.js";

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
    announcements: (data.announcements && typeof data.announcements === "object")
      ? data.announcements : null,
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
 * @param {"rsvp"|"invite"|"gift"|"hostess"|"album"} tokenType
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
 * Fetch the entrance dataset (guest list + tables + seating map) by hostess
 * token. Guest phone numbers are never included — the SQL function returns
 * only id / name / count / companions / arrivedSeats per guest.
 *
 * `writesOpen` is the server's answer to "may this link mark arrival", read
 * from payload->>'hostessWriteActive'. It is advisory for the UI only: the
 * write RPC re-checks the same switch, because a token holder can call the RPC
 * directly and a toggle that only hides a button is decoration.
 *
 * @param {string} token — the hostess UUID token from the URL
 * @returns {{ cloudId, name, guests: [], tables: [], seating: {}, writesOpen: boolean }|null}
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
    // Absent means open, matching the collab switch: an event whose owner has
    // never touched the setting must not hand the greeter a dead link.
    writesOpen: data.writes_open !== false,
  };
}

/**
 * Mark which people of one guest row are physically in the room, by hostess
 * token.
 *
 * This is the ONLY write the entrance link can perform. It cannot add a guest,
 * cannot move anyone between tables, cannot read or write a phone number and
 * cannot touch gifts — not because this function declines to, but because
 * `hostess_mark_arrival_by_token` is the only write RPC the token opens and it
 * touches exactly `arrivedSeats` and `arrived` on one row.
 *
 * @param {string}   token   the hostess token from the URL — the authorisation
 * @param {string}   guestId the guest row id
 * @param {number[]} seats   seat indices that have arrived
 */
export async function markArrivalByToken(token, guestId, seats) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  // Bounded here so an oversized array is rejected before the round-trip, and
  // bounded again in SQL because this function is not the security boundary.
  const clean = [...new Set(
    (Array.isArray(seats) ? seats : [])
      .map(toSeatIndex)
      .filter(i => i !== null && i < 200),
  )].sort((a, b) => a - b).slice(0, 50);

  const { error } = await supabase.rpc("hostess_mark_arrival_by_token", {
    token_value: token,
    guest_id:    String(guestId || "").slice(0, 64),
    seats:       clean,
  });
  if (error) throw error;
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
    .select("id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal, created_at")
    .eq("event_id", eventCloudId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Submit an RSVP response.
 *
 * Goes through submit_rsvp_by_token, which validates the token server-side.
 * The previous direct insert was governed by `WITH CHECK (true)`, so the token
 * check lived only in this file — anyone with an event id could write rows into
 * a stranger's guest list.
 *
 * @param {string} token the rsvp token from the URL — the actual authorisation
 */
export async function submitRSVP(token, response) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  // status: "yes" | "no" | "maybe" — `attending` stays for backward compat.
  const status = response.status || (response.attending ? "yes" : "no");
  // Keep the party size for "yes" and "maybe" (both collect it); "no" is 0.
  const rawCount = status === "no" ? 0 : (response.guestsCount ?? 1);
  const companions = Array.isArray(response.companions)
    ? response.companions.map(c => (c || "").trim()).filter(Boolean).slice(0, 50)
    : [];
  // Bounded to match the column CHECK constraints. Without this a guest who
  // typed a slightly long phone number got a generic "try again" that could
  // never succeed, and simply stopped responding.
  const name  = String(response.name || "").slice(0, 200);
  const phone = (response.phone || "").slice(0, 40) || null;
  const count = Math.max(0, Math.min(50, rawCount));
  // Only meaningful for guests who are coming; "no" never carries a shuttle.
  const shuttleId = status === "no" ? null : (response.shuttleId || null);
  // Same rule for the meal: someone who is not coming does not eat. Bounded
  // here as well as in SQL — this is not the boundary, the RPC is.
  const meal = status === "no" ? null : ((response.meal || "").slice(0, 40) || null);

  const { error } = await supabase.rpc("submit_rsvp_by_token", {
    token_value:  token,
    guest_name:   name,
    phone,
    status,
    guests_count: count,
    companions,
    shuttle_id:   shuttleId,
    meal,
  });
  if (error) throw error;
}

/**
 * Submit a gift (pending payment).
 *
 * @param {string} token the gift token from the URL — the actual authorisation
 */
export async function submitGift(token, gift) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const donor  = String(gift.donorName || "").slice(0, 200);
  const amount = Math.round(gift.amountILS * 100);
  const msg    = (gift.message || "").slice(0, 1000) || null;

  // The function returns void: an unpaid gift row is hidden from anon by RLS,
  // so asking for it back with .select().single() returned zero rows and threw
  // — the gift was saved and the guest was still told it had failed.
  const { error } = await supabase.rpc("submit_gift_by_token", {
    token_value: token,
    donor_name:  donor,
    amount,
    message:     msg,
  });
  if (error) throw error;
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
      companions:   Array.isArray(row.companions) ? row.companions : [],
      // The key is OMITTED, not sent as null, when the caller holds no string.
      // `collab_upsert_by_token` keeps the stored note when the key is absent,
      // so a row this client loaded from a database that predates the notes
      // column cannot write its own ignorance over someone else's note. An
      // explicit "" is a person who emptied the box, and it does clear it.
      ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
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

const COLLAB_COLS      = "id, name, phone, side, guest_group, guests_count, companions, notes, updated_at, updated_by";
const COLLAB_COLS_PRE_NOTES = "id, name, phone, side, guest_group, guests_count, companions, updated_at, updated_by";

/**
 * Owner: read the shared table for an owned event (RLS-guarded, direct).
 *
 * Falls back to the pre-notes column list when the database has not run
 * 20260812000000_collab_notes.sql yet. Without this, the ORDER of the deploy
 * and the migration decides whether the shared table works: new code against
 * an old database asks for a column that is not there, PostgREST answers 400,
 * and the host's whole shared-table sync goes dark with an offline banner and
 * no clue why. Migrations here are run by hand by one person, so "just deploy
 * them in the right order" is a footgun, not a plan.
 *
 * The fallback costs one extra round trip exactly once per outdated database,
 * and nothing at all afterwards.
 */
export async function fetchCollabGuestsOwner(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const read = (cols) => supabase.from("collab_guests").select(cols).eq("event_id", eventCloudId);
  const { data, error } = await read(COLLAB_COLS);
  if (!error) return data ?? [];
  // Anything that is not "the column is not there yet" is a real failure and
  // must not be swallowed into a silently degraded read.
  if (!isMissingColumnError(error)) throw error;
  const retry = await read(COLLAB_COLS_PRE_NOTES);
  if (retry.error) throw retry.error;
  return retry.data ?? [];
}

/**
 * Is this error PostgREST telling us the column does not exist yet?
 *
 * Two different codes, because reads and writes fail differently: a SELECT of
 * an unknown column comes back as Postgres 42703, while an INSERT names the
 * column in its schema cache first and comes back as PGRST204.
 */
function isMissingColumnError(error) {
  return error?.code === "42703"
      || error?.code === "PGRST204"
      || /column .* does not exist/i.test(error?.message ?? "")
      || /could not find the .* column/i.test(error?.message ?? "");
}

/** Owner: push one guest row into the shared table (app→table sync). */
export async function upsertCollabGuestOwner(eventCloudId, row) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return;
  // Same rule on the owner's direct-table path as on the RPC: a column that is
  // not in the payload is not in PostgREST's ON CONFLICT DO UPDATE SET list, so
  // omitting `notes` leaves the stored note alone instead of nulling it.
  const base = {
    id:           row.id,
    event_id:     eventCloudId,
    name:         row.name ?? "",
    phone:        row.phone ?? "",
    side:         row.side ?? null,
    guest_group:  row.guest_group ?? row.group ?? null,
    guests_count: Number(row.guests_count ?? row.count) || 1,
    companions:   Array.isArray(row.companions) ? row.companions : [],
    updated_at:   new Date().toISOString(),
  };
  const payload = typeof row.notes === "string" ? { ...base, notes: row.notes } : base;

  const { error } = await supabase.from("collab_guests").upsert(payload);
  if (!error) return;

  // The READ path has had this fallback since the notes migration was written;
  // the WRITE path did not, and the guard that was supposed to provide it never
  // fires — `guestToCollab` normalises `notes` to "" , so it is ALWAYS a string
  // and the key is always sent. Against a database that has not run
  // 20260812000000_collab_notes.sql the upsert 400s, the retry queue burns its
  // budget on every guest in turn, and the entire app→table direction goes dark
  // while the table→app direction keeps working — which looks like the shared
  // table ignoring the host rather than like a failed deploy.
  //
  // Migrations here are run by hand, by one person, so the window between
  // "deployed" and "migrated" is real and has to survive.
  if (!isMissingColumnError(error) || payload === base) throw error;
  const retry = await supabase.from("collab_guests").upsert(base);
  if (retry.error) throw retry.error;
}

/** Owner: delete rows from the shared table by id (app→table sync). */
export async function deleteCollabGuestsOwner(eventCloudId, ids) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId || !ids?.length) return;
  const { error } = await supabase.from("collab_guests").delete().eq("event_id", eventCloudId).in("id", ids);
  if (error) throw error;
}

// ── Shared event album ──────────────────────────────────────────────────────
// Photos live in the `event-album` storage bucket; album_photos is the index
// the gallery reads, so listing never depends on a storage LIST call.

/** Photos for one event, newest first. Keyed by album token, not event id. */
export async function fetchAlbumPhotos(albumToken) {
  if (!isSupabaseConfigured || !supabase || !albumToken) return [];
  // Via RPC, not a table read: album_photos rows carry the album token, so a
  // readable table would let anyone enumerate every event's token.
  const { data, error } = await supabase.rpc("album_list_by_token", { token_value: albumToken });
  if (error) throw error;
  return (data ?? []).map(r => ({
    ...r,
    url: supabase.storage.from("event-album").getPublicUrl(r.storage_path).data.publicUrl,
  }));
}

/**
 * Upload one photo and index it.
 *
 * The path is prefixed with the event id so a bucket listing can never mix
 * events, and suffixed with a random segment so two guests uploading
 * "IMG_0001.jpg" at the same moment don't collide.
 */
export async function uploadAlbumPhoto(eventCloudId, albumToken, file, uploader) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const ext  = (file.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  // The event id prefix is enforced server-side too — album_add_photo rejects a
  // path that doesn't belong to the token's event.
  const path = `${eventCloudId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("event-album")
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (upErr) throw upErr;

  // Indexed through a definer function: an RLS policy here could not validate
  // the token, because anon cannot read the events table it would need.
  const { error: rowErr } = await supabase.rpc("album_add_photo", {
    token_value:    albumToken,
    path_value:     path,
    uploader_value: (uploader || "").trim().slice(0, 60) || null,
  });
  // A row that fails to write would orphan the file. remove() resolves with
  // { error } instead of rejecting, so a plain .catch() would swallow a real
  // failure — check the result and surface it with the original cause.
  if (rowErr) {
    const { error: rmErr } = await supabase.storage.from("event-album").remove([path]);
    if (rmErr) rowErr.message += " (הקובץ נשאר באחסון ולא נוקה)";
    throw rowErr;
  }
  return path;
}

