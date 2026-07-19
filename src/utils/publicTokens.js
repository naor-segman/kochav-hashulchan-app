import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { mapCloudEventToLocalEvent } from "./cloudSync.js";

/**
 * Fetch the public event data for a given token type and token value.
 * Used by public pages (RSVP, invite, gift, hostess) that have no user auth.
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
    .select("*")
    .eq(column, token)
    .single();
  if (error || !data) return null;
  return mapCloudEventToLocalEvent(data);
}

/**
 * Submit an RSVP response to the rsvp_responses table.
 */
export async function submitRSVP(eventCloudId, response) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("rsvp_responses").insert({
    event_id:     eventCloudId,
    guest_name:   response.name,
    phone:        response.phone   || null,
    attending:    response.attending,
    guests_count: response.guestsCount || 1,
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
    }, payload => onGift(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
