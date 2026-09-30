import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { toSeatIndex } from "./arrival.js";
import { getEventPersonalConfig } from "./eventHelpers.js";

/* Couple names belong to couple events. The setup screen keeps them when the
 * type changes (switching back must not lose them), and the server serves
 * them — so a bar mitzvah that had once been a wedding showed "נועה✦טל" above
 * "את שמחת בר המצווה של איתי", titled every tab "נועה וטל" and asked guests to
 * "שלחו מתנה לנועה וטל" (fifth review 30.9). Guests see them only on a couple
 * event. */
const coupleEvent = (type) => getEventPersonalConfig(type ?? "חתונה").kind === "wedding";

function mapPublicEvent(data) {
  const couple = coupleEvent(data.type);
  return {
    cloudId:          data.id,
    name:             data.name              ?? "",
    type:             data.type              ?? "חתונה",
    date:             data.date              ?? "",
    venue:            data.venue             ?? "",
    brideName:        couple ? data.bride_name ?? "" : "",
    groomName:        couple ? data.groom_name ?? "" : "",
    celebrantName:    data.celebrant_name    ?? "",
    organizationName: data.organization_name ?? "",
    contactName:      data.contact_name      ?? "",
    ownerName:        data.owner_name        ?? "",
    // giftBitPhone / giftPayboxLink used to be mapped here. The RPC no longer
    // serves them (20260818000200) and no screen ever rendered them: GiftScreen
    // deliberately has no Bit/PayBox route, by the 11.8 decision that a
    // peer-to-peer transfer app charges the HOST the fee. They were reaching
    // every token type — the album QR, which strangers photograph off a table,
    // included. The values still live in events.payload for the host's own copy.
    site: (data.site && typeof data.site === "object") ? data.site : null,
    announcements: (data.announcements && typeof data.announcements === "object")
      ? data.announcements : null,
    rsvpToken:        data.rsvp_token        ?? null,
    giftToken:        data.gift_token        ?? null,
    inviteToken:      data.invite_token      ?? null,
    // Served to the event site only (migration 20260928000400).
    albumToken:       data.album_token       ?? null,
  };
}

/**
 * The server could not be reached, or answered with an error — as opposed to
 * answering "no such link". Until 28.9 every fetcher below returned null / []
 * for both, so a guest whose wifi dropped read "הקישור אינו תקין, או שהאירוע
 * בוטל", a projected gift wall emptied on one failed poll, and the greeter's
 * guest list at the door was replaced by "invalid link" mid-event.
 *
 * None of the token RPCs raises for an unknown token — each returns null or an
 * empty set — so `error` set means transport or server, never "not found".
 */
export class LinkUnreachableError extends Error {
  constructor(cause) {
    super("link unreachable");
    this.name = "LinkUnreachableError";
    this.cause = cause;
  }
}

/**
 * What a guest reads when a write fails (fifth review 30.9). Every failure
 * said "אנא נסו שוב" — including the ones retrying can never fix: a closed
 * link, a full event, an amount out of range. The server's own reason (the
 * RAISE text) decides; anything unknown keeps the caller's "try again".
 */
export function guestWriteError(err, fallback) {
  const m = String(err?.message || err || "").toLowerCase();
  if (/rate limited/.test(m))                 return "יותר מדי שליחות בדקה האחרונה — נסו שוב בעוד דקה.";
  if (/invalid (album )?token/.test(m))       return "הקישור כבר לא פעיל — בקשו מבעלי האירוע קישור מעודכן.";
  if (/limit reached/.test(m))                return "האירוע כבר קיבל את המספר המרבי — אפשר לפנות לבעלי האירוע.";
  if (/amount out of range/.test(m))          return "הסכום מחוץ לטווח — בין ₪50 ל־₪100,000.";
  if (/name required/.test(m))                return "צריך למלא שם.";
  // Storage's refusals, for the album upload.
  if (/row-level security|unauthorized|path does not belong/.test(m) || err?.statusCode === "403" || err?.status === 403) {
    return "הקישור לאלבום השתנה או שהאלבום מלא — בקשו מבעלי האירוע קישור מעודכן.";
  }
  if (/too large|payload/.test(m) || err?.statusCode === "413" || err?.status === 413) return "התמונה גדולה מדי.";
  if (/mime|content type|invalid_mime/.test(m) || err?.statusCode === "415" || err?.status === 415) {
    return "סוג הקובץ לא נתמך — אפשר JPEG, PNG, WEBP או HEIC.";
  }
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || /failed to fetch|network|load failed/.test(m)) {
    return "אין חיבור כרגע — נסו שוב בעוד רגע.";
  }
  return fallback;
}

/** What a guest page says when the server cannot be reached. One copy. */
export const UNREACHABLE_TEXT = {
  title: "אין חיבור כרגע",
  body:  "לא הצלחנו להגיע לשרת — הקישור עצמו בסדר. נסו לרענן את הדף בעוד רגע.",
};

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
  if (error) throw new LinkUnreachableError(error);
  if (!data) return null;
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
  if (error) throw new LinkUnreachableError(error);
  if (!data) return null;
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
export async function markArrivalByToken(token, guestId, seats, base) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  // Bounded here so an oversized array is rejected before the round-trip, and
  // bounded again in SQL because this function is not the security boundary.
  const bound = (list) => [...new Set(
    (Array.isArray(list) ? list : [])
      .map(toSeatIndex)
      .filter(i => i !== null && i < 200),
  )].sort((a, b) => a - b).slice(0, 50);
  const clean = bound(seats);
  const args = {
    token_value: token,
    guest_id:    String(guestId || "").slice(0, 64),
    seats:       clean,
  };

  // With `base` — the seats the screen showed BEFORE this tap — the server
  // applies only the difference, so two greeters on one family inside one
  // refresh window no longer overwrite each other (ג2, migration
  // 20260928000700). If that migration has not run yet, PostgREST cannot
  // find a 4-argument function (PGRST202) and the old full-list write is
  // used instead: a door that keeps working beats a door that is exact.
  if (Array.isArray(base)) {
    const { error } = await supabase.rpc("hostess_mark_arrival_by_token", { ...args, base: bound(base) });
    if (!error) return;
    if (error.code !== "PGRST202") throw error;
  }
  const { error } = await supabase.rpc("hostess_mark_arrival_by_token", args);
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
  const args = { token_value: token, donor_name: donor, amount, message: msg };
  // One key per filled-in form (the page makes it). The server stores a key
  // once, so a double tap or a retry after a lost response is one gift — and
  // two families who happen to share a name and an amount are two
  // (20260929000000; the old guard matched on name and dropped the second).
  // Before that migration runs, the 5-argument function does not exist
  // (PGRST202) and the old call is used.
  const key = typeof gift.clientKey === "string" && gift.clientKey ? gift.clientKey.slice(0, 64) : null;
  if (key) {
    const { error } = await supabase.rpc("submit_gift_by_token", { ...args, client_key: key });
    if (!error) return;
    if (error.code !== "PGRST202") throw error;
  }
  const { error } = await supabase.rpc("submit_gift_by_token", args);
  if (error) throw error;
}

/**
 * Host: the gifts declared on the gift page, WITH the amounts.
 *
 * The counterpart to fetchGiftWall, and the reason both exist. The wall is
 * projected on a screen in a hall, so its RPC returns donor_name and message and
 * deliberately omits `amount` — that is not an oversight to be fixed, it is the
 * feature. This read is the private half: the host, signed in, on their budget.
 *
 * No new migration was needed. `gifts_owner_select` has been live since
 * 20260716000000 — `event_id IN (SELECT id FROM events WHERE user_id =
 * auth.uid())` — and only `anon` had SELECT revoked, so a signed-in owner could
 * always have read this. Nothing ever did: `.from("gifts")` had zero callers in
 * the whole app, which is why a guest could declare a sum, watch it save, and
 * have it reach nobody.
 *
 * THREE TRAPS, all load-bearing:
 *
 *   `amount` is stored in AGOROT — submitGift multiplies by 100. Every
 *   host-facing number in this app is shekels, so the division happens here,
 *   once, rather than at each call site.
 *
 *   `paid` is hardcoded false by submit_gift_by_token and NOTHING ever sets it
 *   true — no Stripe webhook, no migration. A `.eq("paid", true)` here would
 *   read zero forever and look like a working feature.
 *
 *   A gift row carries NO link to a guest — no guest_id, no phone, only the
 *   free-text name the donor typed. So this totals per EVENT and never claims to
 *   attribute per guest. The app's own sample blessings say why: "משפחת כהן",
 *   "צוות המשרד", "סבתא מרים" are none of them a guest-row name.
 *
 * @param {string} eventCloudId
 * @returns {{id, donorName, amountILS, message, createdAt}[]} newest first
 */
export async function fetchEventGifts(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const { data, error } = await supabase
    .from("gifts")
    .select("id, donor_name, amount, message, created_at, hidden")
    .eq("event_id", eventCloudId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id:        r.id,
    // The HOST sees hidden rows — hiding is about the projector in the hall,
    // not about the host's own record of what was declared.
    hidden:    r.hidden === true,
    donorName: r.donor_name || "",
    // Number(...) || 0 rather than a bare divide: one null amount would make the
    // whole total NaN, and a NaN total renders as "₪NaN" on a budget screen.
    amountILS: (Number(r.amount) || 0) / 100,
    message:   r.message || "",
    createdAt: r.created_at,
  }));
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
  if (error) throw new LinkUnreachableError(error);
  if (!Array.isArray(data)) return [];
  return data;
}

// ── Collaborative guest list ──────────────────────────────────────────────────

/** Minimal event info for the public collab form (name + side sources). */
export async function fetchCollabEvent(token) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const { data, error } = await supabase.rpc("collab_event_by_token", { token_value: token });
  if (error) throw new LinkUnreachableError(error);
  if (!data) return null;
  return {
    cloudId:    data.id,
    name:       data.name       ?? "",
    type:       data.type       ?? "חתונה",
    brideName:  coupleEvent(data.type) ? data.bride_name ?? "" : "",
    groomName:  coupleEvent(data.type) ? data.groom_name ?? "" : "",
    coupleType: data.couple_type ?? "bride-groom",
    // The collab table calls getSideLabels(ev) too, so without this an aunt
    // adding names to a two-mother family's bar mitzvah sees "משפחת האם /
    // משפחת האב" — the exact wording the picker exists to avoid, on the one
    // screen the extended family actually opens. Needs the RPC to return it:
    // migration 20260814000000_collab_parents_type.sql.
    parentsType: data.parents_type ?? "mother-father",
    sideLabels: (data.side_labels && typeof data.side_labels === "object") ? data.side_labels : null,
    // The host's own groups (migration 20260928000600). Strings only.
    customGroups: Array.isArray(data.custom_groups)
      ? data.custom_groups.filter(g => typeof g === "string" && g.trim()) : [],
  };
}

// ── Live collaborative guest table ────────────────────────────────────────────
// A shared, real-time table: family members read the whole list and add/edit/
// delete rows by token; the owner's app two-way-syncs it with the guest list.

/** Anon: read every row of the shared table for an event, by token. */
export async function fetchCollabGuests(token) {
  if (!isSupabaseConfigured || !supabase || !token) return [];
  const { data, error } = await supabase.rpc("collab_list_by_token", { token_value: token });
  if (error) throw new LinkUnreachableError(error);
  if (!Array.isArray(data)) return [];
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

// ── The HOST's view of the album — checklist 57 ──────────────────────────────
//
// Until 57 there was none. The owner SELECT and DELETE policies on album_photos
// and on the storage objects existed and nothing in the client used them, so a
// host who wanted to see or remove a photo opened the same public link a guest
// does, with the same powers: none.

/**
 * Every photo in this event's album, INCLUDING hidden ones, newest first.
 *
 * A table read under owner RLS, not the public RPC: album_list_by_token now
 * leaves hidden photos out (that is what hiding is for), and the host has to be
 * able to see a hidden photo to un-hide it. Keyed on the CLOUD id — the FK and
 * the storage folder are both events.id — so an event that has never synced has
 * no album to read, and the screen says so rather than showing an empty grid.
 *
 * @param {string} eventCloudId  ev.cloudId, never ev.id
 */
export async function fetchHostAlbumPhotos(eventCloudId) {
  if (!isSupabaseConfigured || !supabase || !eventCloudId) return [];
  const { data, error } = await supabase
    .from("album_photos")
    .select("id, storage_path, uploader, created_at, hidden")
    .eq("event_id", eventCloudId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id:          r.id,
    storagePath: r.storage_path,
    uploader:    r.uploader || "",
    createdAt:   r.created_at,
    hidden:      r.hidden === true,
    url: supabase.storage.from("event-album").getPublicUrl(r.storage_path).data.publicUrl,
  }));
}

/**
 * An UPDATE or DELETE that RLS refuses is not an error in PostgREST — it just
 * matches no rows, and `{ error: null }` comes back. Every moderation call
 * below reported success on that, so a host could press "delete", watch the
 * photo leave the screen, and the photo stayed on the guests' album (28.9
 * audit). Asking for the affected ids back and requiring exactly one turns a
 * silent refusal into a thrown one, which the screens already roll back on.
 */
function exactlyOne({ data, error }) {
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("the change was not applied (no permission, or the row is gone)");
  }
  return true;
}

/**
 * Take a photo out of the public album, or put it back.
 *
 * Only the `hidden` column is writable by the owner — the migration grants
 * UPDATE on that one column, so this cannot be widened into rewriting a row's
 * storage path by accident. Hiding does NOT revoke the file's address: the
 * bucket is public, and anyone who saved the direct URL can still open it. Only
 * deleteAlbumPhoto takes a photo off the internet.
 */
export async function setAlbumPhotoHidden(photoId, hidden) {
  if (!isSupabaseConfigured || !supabase || !photoId) return false;
  return exactlyOne(await supabase
    .from("album_photos")
    .update({ hidden: !!hidden })
    .eq("id", photoId)
    .select("id"));
}

/**
 * Delete a photo — the FILE first, then its row.
 *
 * The order is the whole design. The two deletes cannot be one transaction
 * (storage and the table are different APIs), so one of them can fail after the
 * other succeeded, and the two failure modes are not equal:
 *
 *   row gone, file left  →  the photo is still PUBLICLY REACHABLE at its URL,
 *                           off every list, where the host can no longer see
 *                           it to try again. The host asked for it to be gone
 *                           and it is not, and nothing says so.
 *   file gone, row left  →  a broken tile in the host's own grid, with the
 *                           delete button still under it. Pressing it again
 *                           finishes the job: removing a path that no longer
 *                           exists is not an error.
 *
 * So the file goes first, and if that fails nothing has changed at all.
 * `remove()` resolves with `{ error }` rather than rejecting, so its result is
 * checked explicitly — a bare await would report success on a failed delete.
 *
 * @param {{id: string, storagePath: string}} photo
 */
export async function deleteAlbumPhoto(photo) {
  if (!isSupabaseConfigured || !supabase || !photo?.id || !photo?.storagePath) return false;
  const { error: rmErr } = await supabase.storage.from("event-album").remove([photo.storagePath]);
  if (rmErr) throw rmErr;
  // An empty `remove` result is NOT checked: it also means "already gone",
  // which is exactly the state a retry after a half-finished delete is in.
  // The row delete below is checked, and both are fenced by the same
  // ownership rule, so a refused file delete is caught there.
  return exactlyOne(await supabase.from("album_photos").delete().eq("id", photo.id).select("id"));
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
  // <event id>/<album token>/<file>. The storage policy admits a file only
  // under the event's CURRENT album token, so changing the album link revokes
  // uploads (migration 20260930000000); album_add_photo checks the same prefix.
  const path = `${eventCloudId}/${albumToken}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

/**
 * Take a blessing off the public wall, or put it back.
 *
 * WHY THIS EXISTS: `submit_gift_by_token` is open to anon, needs only a name
 * and ₪5, and stores a 1,000-character message — and the wall polls every 30
 * seconds onto a screen in the hall. Anyone the gift link was forwarded to
 * could put arbitrary text on it at somebody's wedding, and until now there was
 * no path anywhere in the product to take it down.
 *
 * Hiding rather than deleting is the default action for a reason: moderation
 * should not destroy the host's own record of a declared gift, and a mistaken
 * hide has to be reversible while the party is still going.
 */
export async function setGiftHidden(giftId, hidden) {
  if (!isSupabaseConfigured || !supabase || !giftId) return false;
  return exactlyOne(await supabase
    .from("gifts")
    .update({ hidden: !!hidden })
    .eq("id", giftId)
    .select("id"));
}

/** Remove a blessing entirely — from the wall AND from the host's list. */
export async function deleteEventGift(giftId) {
  if (!isSupabaseConfigured || !supabase || !giftId) return false;
  return exactlyOne(await supabase.from("gifts").delete().eq("id", giftId).select("id"));
}
