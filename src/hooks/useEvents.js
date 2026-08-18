import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist, userStorageKey } from "../utils/storage.js";
import { normalizeEvent, updateEventTimestamp, TOKEN_KEYS, TOMBSTONED_COLLECTIONS } from "../utils/eventHelpers.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  SYNC_STATUS,
  fetchCloudEvents,
  CLOUD_EVENTS_LIMIT,
  createCloudEvent,
  updateCloudEvent,
  deleteCloudEvent,
  CloudConflictError,
} from "../utils/cloudSync.js";

// Tokens are merged PER KEY, never as a whole object.
//
// `album` has no column of its own — it lives only inside `payload`. A cloud row
// written before the album feature therefore comes back with `album: null`, and
// swapping the whole object let that null win. `normalizeEvent` then minted a
// fresh UUID, and every album QR already printed on an invitation 404'd. The
// mapper carries a guard for exactly this hazard; the merge used to re-open it.
//
// Rule: a token that exists on either side survives; the cloud wins only where
// it actually has a value. `fallback` is the already-normalized token set, used
// only where neither side has one — otherwise a key missing on both sides would
// come out null and, past the normalize gateway, stay null.
function mergeTokens(cloudTokens, localTokens, fallback, cloudRotatedAt, localRotatedAt) {
  // Rotation flips the precedence, and only rotation does.
  //
  // Killing a leaked link means minting a new token. But this merge let the
  // CLOUD win per key, so a host who rotated and then reloaded before the
  // debounced push landed got the dead link back — and a second device holding
  // the old token would push it back over the new one. Revocation that can be
  // silently undone is not revocation.
  //
  // `tokensRotatedAt` says which side last did that deliberately. With neither
  // side rotated — every event today — this is exactly the old behaviour.
  const localWins = Number.isFinite(localRotatedAt) &&
    localRotatedAt > (Number.isFinite(cloudRotatedAt) ? cloudRotatedAt : 0);
  const first  = localWins ? localTokens : cloudTokens;
  const second = localWins ? cloudTokens : localTokens;
  return Object.fromEntries(
    TOKEN_KEYS.map(k => [k, first?.[k] || second?.[k] || fallback?.[k] || null])
  );
}

/**
 * Take the cloud's arrival state for any guest this tab has never expressed an
 * opinion about.
 *
 * "Never expressed an opinion" is precisely `arrivedSeats === undefined` and no
 * truthy `arrived`. That is different from `arrivedSeats: []`, which is the host
 * deliberately un-marking someone — so un-marking still wins, and a host who
 * marks people on their own device still wins. Only the guests the local copy is
 * silent about are taken from the cloud, which is exactly the set the greeter
 * touched after this tab last read the row.
 *
 * A guest missing from either side is left alone; this never adds or removes a
 * row, only two keys on rows that exist on both.
 */
/**
 * Rows the OTHER device added, which whole-event last-write-wins throws away.
 *
 * THE FAILURE THIS EXISTS FOR — reproduced end to end:
 *   Both devices hold cloud v5. The phone adds 37 guests at 20:00 and pushes;
 *   the cloud is now v6. The laptop edits the venue name at 20:05 — its local
 *   version is also 6, its syncedVersion is still 5, so `eq(version, 5)` misses
 *   and the push raises CloudConflictError. That is the mechanism WORKING. But
 *   the recovery re-fetches and hands the row to this merge, which sees the
 *   laptop's 20:05 as newer than the phone's 20:00 and keeps the laptop's copy
 *   WHOLE. The 37 guests vanish from the laptop's screen and its localStorage,
 *   `syncedVersion` is set to 6, and the laptop's next edit writes 3 guests
 *   over the cloud unopposed. Nothing re-pushes, and hydration runs once per
 *   login, so nothing ever corrects it.
 *
 * So: whichever side's SCALARS win, a row that exists only on the other side is
 * kept. Local wins every id both sides have — this tab's edits are still newer,
 * which is the whole reason it won.
 *
 * THE TRADE, STATED PLAINLY. Without tombstones, a union cannot tell "the other
 * device added this" from "I deleted this and my delete has not landed yet", so
 * a guest deleted locally before the push lands can come back on the next pull.
 * That is the right way round: a resurrected row is visible and takes one click
 * to remove again, and 37 silently deleted guests are gone for good. If it ever
 * becomes a real complaint the answer is deletion tombstones, not reverting
 * this.
 */
function unionById(localRows, cloudRows, tombstones) {
  // The trade in the paragraph above, closed. A tombstone is this account
  // saying "I deleted this row", so a copy of it arriving from the other side
  // is not a row that device ADDED — it is a device that has not heard yet.
  // Without this, a guest deleted on the laptop came back from the phone's
  // copy, and a table with it; measured, in both merge directions.
  //
  // BOTH sides are filtered, not just the incoming extras. Whichever side won
  // on scalars becomes the base array here, and when that is the cloud copy it
  // still contains the row this device deleted — filtering only the extras let
  // it straight through, which is exactly how the first version of this passed
  // the local-wins case and failed the cloud-wins one.
  const drop = (rows) => tombstones && Object.keys(tombstones).length
    ? rows.filter(r => !r?.id || !tombstones[r.id])
    : rows;

  if (!Array.isArray(cloudRows) || !cloudRows.length) {
    return Array.isArray(localRows) ? drop(localRows) : localRows;
  }
  if (!Array.isArray(localRows)) return drop(cloudRows);

  const base     = drop(localRows);
  const localIds = new Set(localRows.map(r => r?.id).filter(Boolean));
  const extras   = cloudRows.filter(r =>
    r?.id && !localIds.has(r.id) && !tombstones?.[r.id]);
  return extras.length ? [...base, ...extras] : base;
}

/**
 * Union two tombstone maps for one collection, keeping the EARLIEST stamp.
 *
 * Earliest, because the stamp answers "when was this deleted", and the device
 * that did it holds the true answer; a later stamp is another device noticing.
 * It also has to be a union rather than last-write-wins for the same reason
 * every other collection here does: a tombstone the other device recorded is a
 * fact this one has not learned yet, and dropping it un-deletes the row.
 */
/**
 * Record a tombstone for every id-keyed row this patch REMOVED.
 *
 * Derived here rather than at each delete site on purpose. There are a dozen
 * places that remove a guest, a table, a constraint, a task or a vendor —
 * GuestManagerScreen, the import review, TableBuilder, the seating screen's
 * quick-remove, the collab reconciler, bulk delete — and asking each of them to
 * remember to also write a tombstone is a rule that gets followed until someone
 * adds the thirteenth. Every one of them goes through patchEventById, so the
 * diff is taken once, here, and a delete site added next year is covered
 * without knowing this exists.
 *
 * A row is tombstoned only when the collection was actually PRESENT before and
 * after: a patch that does not mention `guests` must not be read as deleting
 * all of them, and neither must one that sets it to something that is not an
 * array.
 */
function withTombstones(before, after, now = Date.now()) {
  let added = null;
  for (const key of TOMBSTONED_COLLECTIONS) {
    const was = before?.[key], is = after?.[key];
    if (!Array.isArray(was) || !Array.isArray(is)) continue;
    if (is.length >= was.length) {
      // Fast path: nothing can have been removed without the length dropping,
      // because ids are unique within a collection.
      continue;
    }
    const stillThere = new Set(is.map(r => r?.id).filter(Boolean));
    for (const row of was) {
      if (!row?.id || stillThere.has(row.id)) continue;
      added ??= {};
      (added[key] ??= {})[row.id] = now;
    }
  }
  if (!added) return after;

  const prev = (after?.deletedRows && typeof after.deletedRows === "object") ? after.deletedRows : {};
  const next = { ...prev };
  for (const [key, rows] of Object.entries(added)) next[key] = { ...(prev[key] ?? {}), ...rows };
  return { ...after, deletedRows: next };
}

function mergeTombstoneMaps(localTombs, cloudTombs) {
  const l = (localTombs && typeof localTombs === "object") ? localTombs : {};
  const c = (cloudTombs && typeof cloudTombs === "object") ? cloudTombs : {};
  const keys = new Set([...Object.keys(l), ...Object.keys(c)]);
  if (!keys.size) return localTombs ?? {};
  const out = {};
  for (const k of keys) {
    const lb = (l[k] && typeof l[k] === "object") ? l[k] : {};
    const cb = (c[k] && typeof c[k] === "object") ? c[k] : {};
    const merged = { ...cb, ...lb };
    for (const rowId of Object.keys(merged)) {
      const a = lb[rowId], b = cb[rowId];
      merged[rowId] = (Number.isFinite(a) && Number.isFinite(b)) ? Math.min(a, b) : (a ?? b);
    }
    out[k] = merged;
  }
  return out;
}

/**
 * The two-level record of who has already been messaged:
 * `{ [stageKey]: { [guestId]: timestamp } }`.
 *
 * Whole-object last-write-wins is wrong here in a way that costs real money and
 * real goodwill. A send is a fact about the world — the guest's phone buzzed —
 * so a stage the OTHER device sent is not something this device can undo by
 * having edited the venue afterwards. Losing it means the host re-sends the
 * invitation to everybody who already got it.
 *
 * Union at both levels, earliest stamp kept: if two devices both think they
 * sent to the same guest, the first one is the one that actually did.
 */
function mergeSentMaps(localSent, cloudSent) {
  const l = (localSent && typeof localSent === "object") ? localSent : {};
  const c = (cloudSent && typeof cloudSent === "object") ? cloudSent : {};
  const keys = new Set([...Object.keys(l), ...Object.keys(c)]);
  if (!keys.size) return localSent;
  const out = {};
  for (const k of keys) {
    const lg = (l[k] && typeof l[k] === "object") ? l[k] : {};
    const cg = (c[k] && typeof c[k] === "object") ? c[k] : {};
    const merged = { ...cg, ...lg };
    for (const gid of Object.keys(merged)) {
      const a = lg[gid], b = cg[gid];
      merged[gid] = (Number.isFinite(a) && Number.isFinite(b)) ? Math.min(a, b) : (a ?? b);
    }
    out[k] = merged;
  }
  return out;
}

/** Flat `{ key: value }` — union the keys, the winning side's value on a clash. */
function unionByKey(localMap, cloudMap) {
  const l = (localMap && typeof localMap === "object") ? localMap : {};
  const c = (cloudMap && typeof cloudMap === "object") ? cloudMap : {};
  const extra = Object.keys(c).filter(k => !Object.hasOwn(l, k));
  return extra.length ? { ...c, ...l } : localMap;
}

/**
 * The budget is edited as a whole by CostScreen (`patchEvent({ costs: {
 * categories } })`), so merging it category by category would build a budget
 * neither device ever saw. The only failure worth preventing is the total one:
 * an empty side overwriting a filled one.
 */
function keepFilledCosts(winner, loser) {
  const has = v => Array.isArray(v?.categories) && v.categories.length > 0;
  return (!has(winner) && has(loser)) ? loser : winner;
}

function mergeArrivals(localGuests, cloudGuests) {
  if (!Array.isArray(localGuests) || !Array.isArray(cloudGuests)) return localGuests;
  const cloudById = new Map(cloudGuests.filter(g => g && g.id).map(g => [g.id, g]));
  const take = c => ({ arrivedSeats: c.arrivedSeats, arrived: c.arrived, arrivedAt: c.arrivedAt });
  const stamp = g => (Number.isFinite(g?.arrivedAt) ? g.arrivedAt : null);
  const silent = g => g?.arrivedSeats === undefined && !g?.arrived;

  return localGuests.map(g => {
    const c = cloudById.get(g.id);
    if (!c || silent(c)) return g;

    // The rule, once both sides carry a stamp: whoever wrote last wins. That is
    // the only question about arrivals with a correct answer, because the two
    // writers are different PEOPLE — the host on their phone and the greeter at
    // the door — and neither is authoritative over the other.
    const ls = stamp(g), cs = stamp(c);
    if (ls !== null && cs !== null) return cs > ls ? { ...g, ...take(c) } : g;
    if (cs !== null && ls === null) return { ...g, ...take(c) };
    if (ls !== null && cs === null) return g;

    // NEITHER side is stamped: rows written before this shipped, or by a client
    // that has not updated. Fall back to the old rule exactly — the local copy
    // wins if it has said anything at all — so nothing about existing data
    // changes behaviour until it is next touched.
    //
    // The old rule is wrong (it cannot tell a local opinion from a value it
    // copied from the cloud), and this is the shape of being wrong that loses
    // the SECOND update rather than the first. Kept only as the legacy path.
    return silent(g) ? { ...g, ...take(c) } : g;
  });
}

// Cloud events take precedence over local events with the same ID.
// Local-only events (no cloudId, not present in cloud) are kept as-is.
// Exported for tests: this function decides which copy of an event survives,
// so a silent regression here is unrecoverable customer data loss.
// `cloudIsAuthoritative` says the caller read the account's COMPLETE event list
// and the read succeeded — which is what makes an event's ABSENCE meaningful
// rather than merely unknown. It is opt-in, and off by default, because a
// caller that guesses wrong here deletes real events: a failed fetch, a
// truncated page, or a fetch for a different account must never reach this
// function claiming authority. See the loop at the bottom.
//
// `fetchedAt` is the moment that read was ISSUED, and it closes the race the
// authority flag alone leaves open: an event created on this device while the
// fetch was already in flight is missing from the response because the query
// ran before it existed, not because anyone deleted it. Without this, a create
// that lands mid-hydration is deleted locally while its cloud row survives —
// the orphan is invisible to the user until the next device syncs. Both
// timestamps come from this device's own clock, so server skew is irrelevant.
export function mergeCloudWithLocal(
  localEvents,
  cloudEvents,
  { cloudIsAuthoritative = false, fetchedAt = Infinity, unpushedIds = null } = {},
) {
  /* ── `unpushedIds` — the fix for a data-loss path ──────────────────────────
   *
   * `version` is a per-device counter, `syncedVersion` is the server's.
   * `isCloudBacked` in storage.js is `syncedVersion === version`, and
   * `pruneCloudBackedEvents` runs on that AUTOMATICALLY on SIGNED_OUT.
   *
   * That predicate is right for every path but one. In the ORDINARY two-device
   * conflict — one edit on each side — both counters land on N+1, this merge
   * keeps the local content and takes `syncedVersion` from the cloud row, and
   * the two come out EQUAL while the merged content is held by NEITHER side.
   * The prune then deleted the event from the browser with the cloud still on
   * the pre-conflict copy: the venue, the whole seating map, the locks, the
   * floor-plan image (which never syncs at all), the custom groups. Gone, and
   * AccountScreen shows the host the same predicate as a promise — "כבר בענן
   * ויחזור בכניסה הבאה".
   *
   * The caller is the only one who knows. `pushUpdate` reaches this merge
   * BECAUSE the server rejected its write, so by definition it holds content
   * the cloud does not; hydration knows no such thing and passes nothing, so
   * its behaviour is untouched.
   *
   * Deciding it here instead, by comparing the merged event to the cloud row,
   * was tried and does not work: `normalizeEvent` mints a fresh uuid for every
   * event-site FAQ row and every token that arrives without one, so two copies
   * of identical content never serialise the same and EVERY event would have
   * been marked dirty and re-pushed on every single login.
   */
  const cloudLocalIds = new Set(cloudEvents.map(e => e.id));
  const cloudIds      = new Set(cloudEvents.map(e => e.cloudId).filter(Boolean));

  // One past the base the next push compares against. `updateCloudEvent` sends
  // `.eq("version", syncedVersion)` and writes `version` from the payload, so
  // any other value either skips numbers the server never issued or — when the
  // local counter is behind — writes a version lower than the row it overwrote.
  const markUnpushed = (e) =>
    unpushedIds && unpushedIds.has(e.id)
      ? { ...e, version: (Number.isFinite(e.syncedVersion) ? e.syncedVersion : 0) + 1 }
      : e;

  const merged = cloudEvents.map(ce => {
    const normalized = normalizeEvent(ce);
    // Floor plan image is never uploaded to cloud (base64 is too large).
    // Preserve whatever is in localStorage so the image survives hydration.
    const localMatch = localEvents.find(le =>
      le.id === ce.id || (le.cloudId && le.cloudId === ce.cloudId)
    );
    // Both sides' tombstones, before either branch decides who wins on scalars.
    // A deletion recorded on either device is a deletion, and the branch that
    // loses on scalars still has to have its deletes honoured — otherwise which
    // device happened to edit the venue last would decide whether a guest the
    // OTHER device removed stays removed.
    const tombs = mergeTombstoneMaps(localMatch?.deletedRows, ce.deletedRows);

    // The cloud row is NOT automatically the truth. A write can fail (venue
    // wifi) or simply not have fired yet — the push is debounced 1500ms, so
    // closing the tab right after an edit leaves the cloud a step behind.
    // Taking the cloud copy wholesale in that state deleted the newer local
    // work and then persisted the deletion, which is unrecoverable. Whichever
    // side was written last wins; the cloud id always comes from the cloud.
    if (localMatch && (localMatch.updatedAt ?? 0) > (ce.updatedAt ?? 0)) {
      return markUnpushed(normalizeEvent({
        ...localMatch,
        // Arrivals are the one thing on this row written by SOMEONE ELSE, from a
        // device this tab never sees — the greeter, through the entrance token.
        // Whole-event last-write-wins therefore cannot be right for them: the
        // host edits the venue at 20:32, their copy is newer by definition, and
        // three people the greeter checked in at 20:31 are dropped and then
        // pushed back over the cloud. Measured: exactly that.
        // Two different merges, for two different failures. `unionById` keeps
        // ROWS the other device added; `mergeArrivals` keeps two FIELDS on rows
        // both sides already have. Neither subsumes the other.
        // The tombstone set both sides know about, computed once and applied to
        // every collection below. It has to be the UNION: a row the other
        // device deleted is deleted, whichever side won on scalars.
        deletedRows: tombs,
        guests: mergeArrivals(unionById(localMatch.guests, ce.guests, tombs.guests), ce.guests),
        // Tables too: a second device adding tables is the same shape of loss,
        // and an unseated guest is recoverable while a deleted table is not.
        // `seating` stays local — it references this tab's own ids, and a cloud
        // guest arrives unseated, which is exactly where the host expects a
        // newly imported row to be.
        tables: unionById(localMatch.tables, ce.tables, tombs.tables),
        // The union was written for guests, then extended to tables, and stopped
        // there — while five other collections stayed whole-event
        // last-write-wins. Measured on the code before this line: the other
        // device adds the eleven "must sit together / must not sit together"
        // rules on the phone, this device renames the venue on the laptop, and
        // the merge returns constraints 0, tasks 0, vendors 0, costs {},
        // messagesSent {}. Nothing warns, and the next push writes the empty
        // versions to the cloud.
        //
        // Same argument as for guests: these are id-keyed rows, there are no
        // tombstones, so a delete that has not landed yet may come back — and
        // that is the recoverable failure of the two.
        constraints: unionById(localMatch.constraints, ce.constraints, tombs.constraints),
        tasks:       unionById(localMatch.tasks,       ce.tasks,       tombs.tasks),
        vendors:     unionById(localMatch.vendors,     ce.vendors,     tombs.vendors),
        messagesSent:     mergeSentMaps(localMatch.messagesSent, ce.messagesSent),
        messageTemplates: unionByKey(localMatch.messageTemplates, ce.messageTemplates),
        costs:            keepFilledCosts(localMatch.costs, ce.costs),
        cloudId: ce.cloudId ?? localMatch.cloudId ?? null,
        // The concurrency base always comes from the row we just read, whichever
        // side's CONTENT wins — otherwise the next push compares against a
        // version the server has already moved past and conflicts forever.
        syncedVersion: ce.syncedVersion ?? localMatch.syncedVersion ?? null,
        // Tokens are minted server-side on first sync; never let a local copy
        // that predates that push resurrect a null token — and never let a
        // cloud row that predates a NEW token (album) erase the local one.
        tokensRotatedAt: Math.max(ce.tokensRotatedAt ?? 0, localMatch.tokensRotatedAt ?? 0) || null,
        tokens: mergeTokens(ce.tokens, localMatch.tokens, null,
                            ce.tokensRotatedAt, localMatch.tokensRotatedAt),
      }));
    }

    let result = normalized;

    // The cloud won on scalars — but a row it has never heard of is still this
    // tab's work, so the union runs in BOTH directions. Symmetry is not tidiness
    // here; the asymmetric version is a second, worse bug:
    //
    //   `useCollabSync` keeps `applied` in a ref, which survives a merge, and
    //   computes its delete list as `applied − activeEvent.guests`. So the
    //   moment hydration replaced `guests` with a cloud copy predating the
    //   family's rows, the app concluded the HOST had deleted them and issued a
    //   real `deleteCollabGuestsOwner`. Driven through a rendered hook:
    //   `[["r1","r2","r3"]]` — three relatives' rows deleted out of the shared
    //   table, from the one part of the product that cannot be reconstructed
    //   from anywhere else.
    //
    // Keeping the rows means there is nothing for that pass to conclude was
    // deleted. Same trade as the other direction and the same reasoning: no
    // tombstones, so a delete that has not landed yet can come back, and that
    // is the recoverable failure of the two.
    if (localMatch) {
      // Every collection the other branch unions, unioned here too. The
      // asymmetry was itself a bug: the same eleven constraints were lost
      // whenever the CLOUD copy happened to be the newer one, which is the more
      // common case of the two (the other device is usually the one that just
      // pushed).
      //
      // mergeArrivals belongs here for the same reason, and its absence was the
      // sharper half: the greeter's marks live only in `guests`, so taking the
      // cloud array whole discarded local check-ins that had not been pushed —
      // measured, 4 seats marked at the door became 0 — even though those rows
      // carried the NEWER arrivedAt and mergeArrivals would have kept them.
      // Arguments are (local, cloud) in the other branch; here `result` is the
      // cloud side, so they swap.
      result = {
        ...result,
        deletedRows: tombs,
        guests: mergeArrivals(unionById(result.guests, localMatch.guests, tombs.guests), localMatch.guests),
        tables:      unionById(result.tables,      localMatch.tables,      tombs.tables),
        constraints: unionById(result.constraints, localMatch.constraints, tombs.constraints),
        tasks:       unionById(result.tasks,       localMatch.tasks,       tombs.tasks),
        vendors:     unionById(result.vendors,     localMatch.vendors,     tombs.vendors),
        messagesSent:     mergeSentMaps(result.messagesSent, localMatch.messagesSent),
        messageTemplates: unionByKey(result.messageTemplates, localMatch.messageTemplates),
        costs:            keepFilledCosts(result.costs, localMatch.costs),
      };
    }

    if (localMatch?.floorPlan?.image && !result.floorPlan?.image) {
      // Cloud has no floor plan (positions never synced) but local does. Spread
      // guards against result.floorPlan being null, and tablePositions falls back
      // to the local ones so locally-placed tables aren't wiped on hydration.
      //
      // `elements` needs the same fallback for the same reason: when the cloud
      // copy has no floor plan at all, `result.floorPlan` is null, so the spread
      // contributed no `elements` key and the venue fixtures — chuppah, stage,
      // bar, dance floor — vanished, and that object was what got persisted.
      result = { ...result, floorPlan: {
        ...(result.floorPlan || {}),
        image: localMatch.floorPlan.image,
        tablePositions: result.floorPlan?.tablePositions ?? localMatch.floorPlan.tablePositions ?? {},
        elements:       result.floorPlan?.elements       ?? localMatch.floorPlan.elements       ?? [],
      } };
    }
    // normalizeEvent always produces a tokens object, so check the raw cloud
    // record (ce) instead of the normalized result — per key, so a cloud row
    // that predates one of the tokens cannot erase the local value.
    if (localMatch?.tokens) {
      result = { ...result,
        tokensRotatedAt: Math.max(ce.tokensRotatedAt ?? 0, localMatch.tokensRotatedAt ?? 0) || null,
        tokens: mergeTokens(ce.tokens, localMatch.tokens, result.tokens,
                            ce.tokensRotatedAt, localMatch.tokensRotatedAt) };
    }
    // Applied at BOTH exits. The local-wins branch above returns early, and
    // putting this only here silently skipped the exact case it is for.
    return markUnpushed(result);
  });

  for (const le of localEvents) {
    const inCloud = cloudLocalIds.has(le.id) || (le.cloudId && cloudIds.has(le.cloudId));
    if (inCloud) continue;

    // A local event carrying a cloudId HAS been in this account's cloud — that
    // id was minted by the server on its first push. So when a COMPLETE fetch
    // of the account comes back without it, there is only one explanation: it
    // was deleted, on another device, by this same person.
    //
    // Keeping it did two things, and the second is worse than the first: the
    // event reappeared on this device, AND the next debounced push recreated
    // the cloud row — so the delete was undone on the device that performed
    // it too. Deleting an event on the laptop and finding it back on the phone
    // is exactly what was reported.
    //
    // This is deliberately NOT the same trade as the row-level unions above.
    // There, resurrecting a guest or a table is the recoverable failure and
    // losing one is not. Here the choice is between honouring an explicit
    // delete and making delete not work at all, on either device.
    //
    // `cloudId` is the whole distinction: an event without one has never been
    // pushed (drafted offline, or before signing in), so its absence from the
    // cloud says nothing and it is kept and synced up.
    //
    // And the fetch can only speak for what existed when it ran: an event
    // touched after that moment is newer than the answer, so the answer says
    // nothing about it either.
    const olderThanTheFetch =
      Math.max(le.updatedAt ?? 0, le.createdAt ?? 0) < fetchedAt;
    if (cloudIsAuthoritative && le.cloudId && olderThanTheFetch) continue;

    merged.push(normalizeEvent(le));
  }

  return merged;
}

// ── useEvents ─────────────────────────────────────────────────────────────────
//
// Single source of truth for all event data at runtime.
//
// When user is null (guest):
//   Reads/writes localStorage only — identical to the pre-cloud behaviour.
//
// When user is logged in and Supabase is configured:
//   • HYDRATION: loads cloud events on first login, merges with localStorage.
//   • MUTATIONS: every write is applied locally first (optimistic) then synced
//     to the cloud. Failures leave local data intact.
//   • localStorage always stays in sync as the offline cache / fallback.
// ─────────────────────────────────────────────────────────────────────────────

export function useEvents(user) {
  // Initial (pre-auth) view = guest bucket, drafts only. A cloudId-bearing event
  // in the shared bucket is stale data from a previous logged-in session (older
  // builds used one global key) and must never surface to a guest.
  const [events, setEvents] = useState(() =>
    (loadState().events || []).map(normalizeEvent).filter(Boolean).filter(e => !e.cloudId)
  );
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.LOCAL_ONLY);
  // Which account `events` has actually been loaded FOR. `undefined` until the
  // hydration effect below has run once. See `eventsReady` at the bottom for
  // why a route guard needs this and cannot use syncStatus instead.
  //
  // State and not a ref, even though `ownerRef` below already holds this value:
  // reading a ref during render is a lint ERROR here (`react-hooks/refs`), not
  // a warning. Both writes sit beside `setEvents` calls that were already
  // there, so the `react-hooks/set-state-in-effect` count is unchanged at 20 —
  // measured, not assumed.
  const [hydratedFor, setHydratedFor] = useState(undefined);

  // Refs let callbacks read the latest values without stale-closure issues.
  const eventsRef    = useRef(events);
  const userRef      = useRef(user);
  const loadedForRef = useRef(null);
  // Which account the in-memory `events` belong to → the localStorage key to
  // persist under. null = guest. Prevents writing one user's events under
  // another's key (and vice-versa) as `user` changes.
  const ownerRef     = useRef(null);
  const syncTimers   = useRef({});  // debounce timers keyed by event id
  // Event ids removed before their initial cloud-create resolved, so the create
  // handler can delete the orphaned cloud row instead of letting it resurrect.
  const pendingDeletes = useRef(new Set());
  // Event ids whose cloud-create is in flight, so a second debounced edit
  // cannot fire a duplicate create for the same event.
  const creatingRef    = useRef(new Set());

  useEffect(() => () => { Object.values(syncTimers.current).forEach(clearTimeout); }, []);

  useEffect(() => { eventsRef.current = events; });
  useEffect(() => { userRef.current = user; }, [user]);
  const userId = user?.id ?? null;

  // ── PERSISTENCE ─────────────────────────────────────────────────────────────
  // Flush the full snapshot to localStorage under the CURRENT owner's key, so a
  // logged-in user's events are never written to the shared guest bucket (where
  // the next visitor could read them) and never leak into another account.
  useEffect(() => { persist({ events }, userStorageKey(ownerRef.current)); }, [events]);

  // ── CLOUD HYDRATION + PER-USER STORAGE ───────────────────────────────────────
  // Runs once per logged-in user per session.
  // On logout: reverts state to the shared guest bucket.
  // Keyed on the id, NOT the user object. `useAuth` calls setUser from both
  // getSession() and onAuthStateChange (INITIAL_SESSION, SIGNED_IN,
  // TOKEN_REFRESHED), each producing a NEW object identity for the same person.
  // With `[user]` as the dependency, a token refresh landing mid-hydration ran
  // the cleanup — cancelling the in-flight fetch — and the re-run then returned
  // early on `loadedForRef`, so no replacement fetch ever started. syncStatus
  // stayed SYNCING forever and the next edit pushed a full payload over remote
  // state that had never been read.
  useEffect(() => {
    const load = (key) => (loadState(key).events || []).map(normalizeEvent).filter(Boolean);

    if (!userId) {
      // LOGOUT → guest bucket, drafts only. The just-logged-out account's events
      // live under their own key and are never shown to a guest.
      if (loadedForRef.current !== null) {
        loadedForRef.current = null;
        ownerRef.current = null;
        setEvents(load(userStorageKey(null)).filter(e => !e.cloudId));
        setSyncStatus(SYNC_STATUS.LOCAL_ONLY);
        setHydratedFor(null);
      }
      return;
    }

    if (loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    ownerRef.current = userId;

    // Start from THIS user's own bucket, plus a one-time migration of any
    // unsynced guest-mode events (cloudId === null) created before logging in
    // — honouring "continue without account, it'll sync later" without ever
    // pulling in a different user's already-synced events.
    const userLocal   = load(userStorageKey(userId));
    const guestState  = loadState(userStorageKey(null));
    const guestEvents = (guestState.events || []).map(normalizeEvent).filter(Boolean);
    const guestDrafts = guestEvents.filter(e => !e.cloudId);
    const seenIds     = new Set(userLocal.map(e => e.id));
    const seeded      = [...userLocal, ...guestDrafts.filter(e => !seenIds.has(e.id))];
    // Remove the migrated drafts from the guest bucket so they can't later be
    // adopted by a different account on the same browser.
    if (guestDrafts.length) {
      persist({ events: guestEvents.filter(e => e.cloudId) }, userStorageKey(null));
    }
    // Show THIS user's own data immediately (optimistic local-first) — never the
    // pre-login view.
    setEvents(seeded);
    setHydratedFor(userId);

    // No cloud configured → auth never yields a user, so this path is unreachable.
    if (!isSupabaseConfigured) return;

    // Reconcile with the cloud in an async flow (keeps setState out of the
    // synchronous effect body). Merge base = the seeded per-user view.
    // Cancellation is not optional here. On a shared machine, A logging out
    // and B logging in inside the fetch window let A's response resolve into
    // B's state — mergeCloudWithLocal keeps every cloud event, so A's guest
    // lists and phone numbers landed in B's dashboard and were then persisted
    // under B's storage key.
    let cancelled = false;
    (async () => {
      setSyncStatus(SYNC_STATUS.SYNCING);
      try {
        // Stamped BEFORE the request goes out: anything created after this
        // moment is newer than the answer coming back.
        const fetchedAt = Date.now();
        const cloudEvents = await fetchCloudEvents(userId);
        if (cancelled || ownerRef.current !== userId) return;
        setEvents(prev => mergeCloudWithLocal(prev, cloudEvents, {
          // The fetch resolved, so it did not error, and it came back short of
          // the page limit, so nothing was cut off the end. Both have to hold
          // before an event missing from this list can be read as deleted.
          cloudIsAuthoritative: cloudEvents.length < CLOUD_EVENTS_LIMIT,
          fetchedAt,
        }));
        setSyncStatus(SYNC_STATUS.SYNCED);
      } catch {
        if (cancelled) return;
        setSyncStatus(SYNC_STATUS.ERROR); // keep the seeded local view on failure
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── MUTATIONS ────────────────────────────────────────────────────────────────

  // Push one event to the cloud and keep the concurrency base in step.
  //
  // On CloudConflictError the row moved on since this client last read it —
  // someone edited the same event on another device. Re-read the account's rows
  // and let mergeCloudWithLocal decide per event (newest updatedAt wins),
  // instead of overwriting work this tab never loaded.
  const pushUpdate = useCallback(async (ev, uid) => {
    try {
      const version = await updateCloudEvent(ev, uid);
      if (Number.isFinite(version)) {
        setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, syncedVersion: version } : e));
      }
      setSyncStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (err instanceof CloudConflictError) {
        try {
          const fetchedAt = Date.now();
          const cloudEvents = await fetchCloudEvents(uid);
          if (ownerRef.current !== uid) return;

          // Merged HERE rather than inside a `setEvents(prev => …)` updater,
          // because the retry below needs the result and React does not run an
          // updater synchronously — it runs it during the next render, so the
          // variable was still null when the retry read it and the second push
          // never fired. `eventsRef` is what the rest of this hook already uses
          // for the same purpose, and every render has flushed during the
          // awaited fetch above.
          const next = mergeCloudWithLocal(eventsRef.current, cloudEvents, {
            cloudIsAuthoritative: cloudEvents.length < CLOUD_EVENTS_LIMIT,
            fetchedAt,
            // We are here BECAUSE the server rejected this event's write, so
            // this device is holding content the cloud does not have. See the
            // long note on the option in mergeCloudWithLocal.
            unpushedIds: new Set([ev.id]),
          });
          setEvents(next);
          const mergedThis = next.find(e => e.id === ev.id) ?? null;

          // AND THEN PUSH IT. Without this the merge was a dead end: it built a
          // state neither side held, set SYNCED and stopped — "resolving" a
          // conflict by leaving the resolution on one device. The cloud kept
          // the pre-conflict copy indefinitely, because it is read once per
          // login and nothing re-reads it.
          if (mergedThis?.cloudId) {
            try {
              const v2 = await updateCloudEvent(mergedThis, uid);
              if (ownerRef.current !== uid) return;
              if (Number.isFinite(v2)) {
                setEvents(prev => prev.map(e =>
                  e.id === ev.id ? { ...e, syncedVersion: v2, version: v2 } : e));
              }
              setSyncStatus(SYNC_STATUS.SYNCED);
            } catch {
              // A second conflict is NOT retried — two devices writing in a
              // tight loop would recurse. The event stays unpushed, which is
              // the honest state: the prune will leave it alone and the next
              // ordinary edit sends it.
              setSyncStatus(SYNC_STATUS.ERROR);
            }
            return;
          }
          setSyncStatus(SYNC_STATUS.SYNCED);
        } catch {
          setSyncStatus(SYNC_STATUS.ERROR);
        }
        return;
      }
      setSyncStatus(SYNC_STATUS.ERROR);
    }
  }, []);

  const addEvent = useCallback((ev) => {
    const normalized = normalizeEvent(ev);
    // Apply locally first so the UI is instant.
    setEvents(prev => [normalized, ...prev]);

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;

    setSyncStatus(SYNC_STATUS.SYNCING);
    creatingRef.current.add(normalized.id);
    createCloudEvent(normalized, currentUser.id)
      .then(created => {
        creatingRef.current.delete(normalized.id);
        // If the event was deleted while this create was in flight, the local
        // copy is already gone — delete the just-created cloud row so it can't
        // reappear on the next hydration, instead of adding it back.
        const wasDeleted = pendingDeletes.current.delete(normalized.id);
        if (created) {
          const { cloudId, version } = created;
          if (wasDeleted) {
            deleteCloudEvent(cloudId, currentUser.id).catch(() => {});
          } else {
            setEvents(prev => prev.map(e =>
              e.id === normalized.id ? { ...e, cloudId, syncedVersion: version } : e));
            // Push any edits that arrived during the round-trip so the cloud row stays current.
            const latest = eventsRef.current.find(e => e.id === normalized.id);
            if (latest) pushUpdate({ ...latest, cloudId, syncedVersion: version }, currentUser.id);
          }
        }
        setSyncStatus(SYNC_STATUS.SYNCED);
      })
      .catch(() => {
        creatingRef.current.delete(normalized.id);
        pendingDeletes.current.delete(normalized.id); // create failed → no orphan to clean
        setSyncStatus(SYNC_STATUS.ERROR);
      });
  }, [pushUpdate]);

  const removeEvent = useCallback((id) => {
    // Capture cloudId before removing from state.
    const ev = eventsRef.current.find(e => e.id === id);

    // Cancel any in-flight debounced update for this event.
    clearTimeout(syncTimers.current[id]);
    delete syncTimers.current[id];

    setEvents(prev => prev.filter(e => e.id !== id));

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;
    if (ev?.cloudId) {
      deleteCloudEvent(ev.cloudId, currentUser.id).catch(() => {});
    } else if (ev) {
      // No cloudId yet — its initial create may still be in flight. Flag it so
      // the create handler deletes the orphaned cloud row when it resolves.
      pendingDeletes.current.add(id);
    }
  }, []);

  const patchEventById = useCallback((id, patch) => {
    // Internal cloudId-only patches must not bump updatedAt/version or trigger
    // a cloud write — the row was just created by addEvent.
    const isOnlyCloudId =
      patch !== null &&
      typeof patch === "object" &&
      !Array.isArray(patch) &&
      Object.keys(patch).length === 1 &&
      "cloudId" in patch;

    if (isOnlyCloudId) {
      setEvents(prev => prev.map(e => e.id === id ? { ...e, cloudId: patch.cloudId } : e));
      return;
    }

    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const patched = typeof patch === "function"
        ? patch(e)
        : Object.assign({}, e, patch);
      return updateEventTimestamp(withTombstones(e, patched));
    }));

    // Debounce cloud writes so rapid-fire patches (e.g. typing in a field)
    // don't generate one request per keystroke.
    clearTimeout(syncTimers.current[id]);
    syncTimers.current[id] = setTimeout(() => {
      const ev          = eventsRef.current.find(e => e.id === id);
      const currentUser = userRef.current;
      if (!ev || !currentUser || !isSupabaseConfigured) return;

      // No cloudId means the initial create failed — offline on the train, say.
      // Without a retry the event stayed local-only for good: every later edit
      // hit this early return, so an hour of guest entry existed on exactly one
      // browser and vanished with its cache. Retry the create on the next edit.
      if (!ev.cloudId) {
        // This retry is the same operation as addEvent's create and needs the
        // same two guards, which it did not have:
        //
        //   • in-flight: two edits 1500ms apart during a slow create fired a
        //     SECOND create for one event. The unique token indexes turn that
        //     into an error rather than a duplicate row, so it surfaced as a
        //     spurious "sync failed" AND the second snapshot was never pushed.
        //   • pendingDeletes: an event deleted while the retry was in flight
        //     left an orphaned cloud row that came back on the next hydration.
        if (creatingRef.current.has(id)) return;
        creatingRef.current.add(id);
        setSyncStatus(SYNC_STATUS.SYNCING);
        createCloudEvent(ev, currentUser.id)
          .then(created => {
            creatingRef.current.delete(id);
            const wasDeleted = pendingDeletes.current.delete(id);
            if (!created) { setSyncStatus(SYNC_STATUS.ERROR); return; }
            const { cloudId, version } = created;
            if (wasDeleted) {
              deleteCloudEvent(cloudId, currentUser.id).catch(() => {});
              setSyncStatus(SYNC_STATUS.SYNCED);
              return;
            }
            setEvents(prev => prev.map(e =>
              e.id === id ? { ...e, cloudId, syncedVersion: version } : e));
            // Push whatever arrived during the round-trip, exactly as addEvent
            // does — without this the edit that TRIGGERED the retry was the one
            // change the cloud never received.
            const latest = eventsRef.current.find(e => e.id === id);
            if (latest) pushUpdate({ ...latest, cloudId, syncedVersion: version }, currentUser.id);
            setSyncStatus(SYNC_STATUS.SYNCED);
          })
          .catch(() => {
            creatingRef.current.delete(id);
            pendingDeletes.current.delete(id); // create failed → no orphan to clean
            setSyncStatus(SYNC_STATUS.ERROR);
          });
        return;
      }

      setSyncStatus(SYNC_STATUS.SYNCING);
      pushUpdate(ev, currentUser.id);
    }, 1500);
  }, [pushUpdate]);

  /**
   * Is `events` the list a route guard is allowed to draw conclusions from?
   *
   * A guard cannot use `syncStatus` alone. It starts LOCAL_ONLY, and between
   * "auth resolved a user" and "the hydration effect swapped in that user's
   * bucket" there is at least one render where a logged-in host's own events
   * are simply not in state yet — `events` still holds the pre-login guest
   * view. A guard that redirects in that window sends every bookmarked event
   * URL to the dashboard. Measured: /events/:id/seating, /share and 14 more did
   * exactly that on every full page load; /entrance and /checkin did not, and
   * the only difference was that those two were already given the auth flag.
   *
   * Logged out, this is simply true: there is nothing left to wait for, and the
   * guest bucket is already in state from the initial `useState`.
   */
  const eventsReady = userId ? hydratedFor === userId : true;

  return { events, addEvent, removeEvent, patchEventById, syncStatus, eventsReady };
}
