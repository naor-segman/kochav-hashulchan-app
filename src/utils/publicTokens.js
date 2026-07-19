import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

// Minimal public fields — never exposes other tokens or private guest data
const PUBLIC_EVENT_FIELDS = [
  "id", "name", "type", "date", "venue",
  "bride_name", "groom_name", "celebrant_name",
  "organization_name", "contact_name", "owner_name",
].join(", ");

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
  };
}

/**
 * Fetch the public event data for a given token type and token value.
 * Used by public pages (RSVP, invite, gift, hostess) that have no user auth.
 * Only fetches the minimal columns needed — never exposes cross-page tokens.
 *
 * @param {"rsvp"|"invite"|"gift"|"hostess"} tokenType
 * @param {string} token  — the UUID token from the URL
 * @returns {object|null} — local-shaped event object, or null if not found
 */
export async function fetchEventByToken(tokenType, token) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const column = tokenType + "_token";
  const { data, error } = await supabase
    .from("events")
    .select(PUBLIC_EVENT_FIELDS)
    .eq(column, token)
    .single();
  if (error || !data) return null;
  return mapPublicEvent(data);
}

/**
 * Submit an RSVP response to the rsvp_responses table.
 */
export async function submitRSVP(eventCloudId, response) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const rawCount = response.attending ? (response.guestsCount ?? 1) : 0;
  const { error } = await supabase.from("rsvp_responses").insert({
    event_id:     eventCloudId,
    guest_name:   response.name,
    phone:        response.phone   || null,
    attending:    response.attending,
    guests_count: Math.max(0, Math.min(50, rawCount)),
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
 * Subscribe to real-time gift updates for the gift wall.
 * Returns an unsubscribe function.
 */
export function subscribeToGifts(eventCloudId, onGift) {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel("gifts:" + eventCloudId)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "gifts",
      filter: "event_id=eq." + eventCloudId,
    }, payload => {
      if (payload.new.paid === true) onGift(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
