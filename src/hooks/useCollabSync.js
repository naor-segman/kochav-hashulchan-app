import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  fetchCollabGuestsOwner, upsertCollabGuestOwner,
  deleteCollabGuestsOwner, subscribeCollabGuests,
} from "../utils/publicTokens.js";

// ── Two-way sync: shared collab table ⇄ the event's guest list ────────────────
//
// Keyed by a shared row id. A collab row that is COMPLETE (name + phone + side +
// group) is mirrored into guests; owner edits/adds/deletes in the app are pushed
// back to the collab table. Loops are broken with a per-id "last synced"
// signature: a change is only propagated when it actually differs from what we
// last reconciled, so an echo of our own write is a no-op.

const norm = (s) => (s || "").toString().trim();
const sideOf = (s) => (s === "groom" ? "groom" : "bride");
const normName = (s) => norm(s).replace(/\s+/g, " ").toLowerCase();
const normPhone = (p) => {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
};

// A collab row is complete enough to become a real guest.
const collabComplete = (r) =>
  !!(norm(r.name) && norm(r.phone) && r.side && norm(r.guest_group));

// Signature of the shared fields — same string ⇒ no real change.
const sigCollab = (r) =>
  `${norm(r.name)}|${norm(r.phone)}|${sideOf(r.side)}|${norm(r.guest_group)}|${r.guests_count || 1}`;
const sigGuest = (g) =>
  `${norm(g.name)}|${norm(g.phone)}|${sideOf(g.side)}|${norm(g.group)}|${g.count || 1}`;

// Build/merge a guest row from a collab row, preserving app-only fields.
function guestFromCollab(r, existing) {
  return {
    ...(existing || {}),
    id:    r.id,
    name:  norm(r.name),
    phone: norm(r.phone),
    side:  sideOf(r.side),
    group: norm(r.guest_group) || "משפחה קרובה",
    count: r.guests_count || 1,
    meal:       existing?.meal       ?? "regular",
    rsvp:       existing?.rsvp       ?? "pending",
    notes:      existing?.notes      ?? "",
    companions: existing?.companions ?? [],
  };
}
const guestToCollab = (g) => ({
  id: g.id, name: norm(g.name), phone: norm(g.phone),
  side: sideOf(g.side), guest_group: norm(g.group), guests_count: g.count || 1,
});

export function useCollabSync(activeEvent, patchEvent, showToast) {
  const cloudId  = activeEvent?.cloudId || null;
  const collabOn = !!activeEvent?.tokens?.collab;

  const applied = useRef(new Map()); // id -> signature we last reconciled
  const mirror  = useRef(new Map()); // id -> latest known collab row
  const ready   = useRef(false);

  // ── table → app: initial pull + live subscription ──
  useEffect(() => {
    if (!isSupabaseConfigured || !cloudId || !collabOn) { ready.current = false; return; }
    let cancelled = false;
    let unsub = () => {};
    ready.current = false;
    applied.current = new Map();
    mirror.current = new Map();

    const applyRow = (row) => {
      mirror.current.set(row.id, row);
      if (!collabComplete(row)) return;
      const sig = sigCollab(row);
      if (applied.current.get(row.id) === sig) return; // already reflected
      applied.current.set(row.id, sig);
      patchEvent((e) => {
        const guests = e.guests || [];
        // Match by id first; else dedup against an existing guest by phone
        // (strong) or name, so a family addition of someone already on the list
        // updates them instead of creating a duplicate.
        let existing = guests.find((g) => g.id === row.id);
        if (!existing) {
          const p = normPhone(row.phone);
          existing = (p && guests.find((g) => normPhone(g.phone) === p)) ||
                     guests.find((g) => normName(g.name) === normName(row.name));
        }
        if (existing) {
          const merged = { ...guestFromCollab(row, existing), id: existing.id };
          return { ...e, guests: guests.map((g) => (g.id === existing.id ? merged : g)) };
        }
        return { ...e, guests: [...guests, guestFromCollab(row, null)] };
      });
    };

    const removeRow = (id) => {
      mirror.current.delete(id);
      if (!applied.current.has(id)) return; // was only a draft, never a guest
      applied.current.delete(id);
      let removedName = "";
      patchEvent((e) => {
        const g = (e.guests || []).find((x) => x.id === id);
        removedName = g?.name || "";
        return { ...e, guests: (e.guests || []).filter((x) => x.id !== id) };
      });
      if (removedName && showToast) showToast(`"${removedName}" הוסר — סונכרן מהטבלה השיתופית`);
    };

    (async () => {
      try {
        const rows = await fetchCollabGuestsOwner(cloudId);
        if (cancelled) return;
        rows.forEach(applyRow);
      } catch { /* offline — retry on next mount */ }
      if (cancelled) return;
      ready.current = true;
      unsub = subscribeCollabGuests(cloudId, (payload) => {
        if (payload.eventType === "DELETE") removeRow(payload.old?.id);
        else if (payload.new) applyRow(payload.new);
      });
    })();

    return () => { cancelled = true; unsub(); ready.current = false; };
  }, [cloudId, collabOn, patchEvent, showToast]);

  // ── app → table: push owner add/edit/delete of guests ──
  const guests = activeEvent?.guests;
  useEffect(() => {
    if (!ready.current || !isSupabaseConfigured || !cloudId || !collabOn) return;
    const list = guests || [];
    const seen = new Set();

    list.forEach((g) => {
      seen.add(g.id);
      if (!norm(g.name)) return; // don't push nameless rows
      const sig = sigGuest(g);
      if (applied.current.get(g.id) === sig) return;            // unchanged since last sync
      const m = mirror.current.get(g.id);
      if (m && sigCollab(m) === sig) { applied.current.set(g.id, sig); return; } // already matches table
      applied.current.set(g.id, sig);
      mirror.current.set(g.id, { ...guestToCollab(g) });
      upsertCollabGuestOwner(cloudId, guestToCollab(g)).catch(() => {});
    });

    // A guest that was previously synced (in `applied`) and is now gone → delete
    // its collab row. Draft collab rows that never became guests are untouched.
    const toDelete = [...applied.current.keys()].filter((id) => !seen.has(id));
    if (toDelete.length) {
      toDelete.forEach((id) => { applied.current.delete(id); mirror.current.delete(id); });
      deleteCollabGuestsOwner(cloudId, toDelete).catch(() => {});
    }
  }, [guests, cloudId, collabOn]);
}
