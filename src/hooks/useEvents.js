import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist, userStorageKey } from "../utils/storage.js";
import { normalizeEvent, normalizeDeletedRows, updateEventTimestamp, TOKEN_KEYS, TOMBSTONED_COLLECTIONS } from "../utils/eventHelpers.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { mergeArrivals } from "../utils/arrival.js";
import { syncBaseOf, threeWayScalars, canonical } from "../utils/syncBase.js";
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
function mergeTokens(cloudTokens, localTokens, fallback, cloudRotatedAt, localRotatedAt,
                     cloudRotations, localRotations) {
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
  //
  // PER LINK since 29.9 (review): with one timestamp for the whole set, the
  // host revoking the family-table link on the laptop and later rotating the
  // door link on a phone holding an older copy made the phone "the newer
  // rotation" for EVERY link — and the revoked family link came back and was
  // pushed. Each link now compares its own rotation time. A side with no
  // per-link record (data from before this) falls back to its one timestamp.
  const rot = (map, scalar, k) => {
    const m = map && typeof map === "object" && Object.keys(map).length ? map : null;
    const v = m ? m[k] : scalar;
    return Number.isFinite(v) ? v : 0;
  };
  return Object.fromEntries(TOKEN_KEYS.map(k => {
    const localWins = rot(localRotations, localRotatedAt, k) > rot(cloudRotations, cloudRotatedAt, k);
    const first  = localWins ? localTokens : cloudTokens;
    const second = localWins ? cloudTokens : localTokens;
    return [k, first?.[k] || second?.[k] || fallback?.[k] || null];
  }));
}

/** Per-link rotation times, the later of the two for each link. */
function mergeRotations(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) if (!(out[k] >= v)) out[k] = v;
  return out;
}

// mergeArrivals moved to utils/arrival.js (28.9) — the host's door screen
// uses the same rule to overlay the greeter's marks while it is open.

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
    // No "same length, nothing removed" shortcut. It was wrong: the shared
    // table's dedupe RE-KEYS a guest (old id out, the family's row id in) at
    // the same length, so the old id got no tombstone and the other device's
    // copy brought it back as a second guest (second review, סב15). Building
    // the id set is a few hundred lookups per patch.
    if (is === was) continue;
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

/* A guest who declines gives their chair back (29.9 second review, סב7).
   Nothing did: the seat stayed in `seating`, so the seating screen showed the
   guest at their table, printed them on the staff sheet and counted their chair
   as taken — "2/2, full" — beside its own line "1 סירבו (לא משובצים)". Every
   path that records a no (the guest list, a bulk mark, an applied RSVP) goes
   through patchEventById, so the rule lives here, once.
   Only on the CHANGE to declined: a decline that was already seated before
   this rule (an older event) is left as the host arranged it. */
export function freeDeclinedSeats(before, after) {
  const seating = after?.seating;
  if (!seating || !Array.isArray(after.guests)) return after;
  const was = new Map((before?.guests || []).map(g => [g?.id, g?.rsvp]));
  let next = null;
  for (const g of after.guests) {
    if (g?.rsvp !== "declined" || was.get(g.id) === "declined" || !was.has(g.id)) continue;
    if (!seating[g.id]) continue;
    next ??= { ...seating };
    delete next[g.id];
  }
  return next ? { ...after, seating: next } : after;
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
/* The arrangement built AROUND the rows the union just rescued.
 *
 * THE FAILURE. In the cloud-wins branch the union keeps a table this device
 * created — and then `seating`, `lockedGuests`, `lockedTables`, `customGroups`
 * and the floor-plan positions were all taken whole from the cloud, which has
 * never heard of that table. The host was left with a table nobody sits at,
 * that has no place on the floor plan, and no way to tell that from "I forgot
 * to seat it". Measured: local held tables [t1, tLOCAL] and seating
 * {g1:t1, g2:tLOCAL}; after the merge, tables [t1, tLOCAL] and seating {}.
 *
 * Keeping a row and dropping everything that gave it meaning is worse than
 * either keeping both or dropping both.
 *
 * The rule: the CLOUD still wins every id it knows about — it won on scalars,
 * and that is not being re-litigated here. What is restored is only the part
 * the cloud CANNOT have an opinion about, because it has never seen the row.
 */
function mergeSeating(cloudSeating, localSeating, cloudKnowsGuest, tableExists) {
  const out = { ...(cloudSeating || {}) };
  for (const [guestId, tableId] of Object.entries(localSeating || {})) {
    // Not `!(guestId in out)`: a guest the cloud knows but left UNSEATED is a
    // deliberate state, and resurrecting the local seat would undo an
    // unseating done on the other device.
    if (cloudKnowsGuest(guestId)) continue;
    if (!tableExists(tableId)) continue;
    out[guestId] = tableId;
  }
  return out;
}

/**
 * The arrangement may only point at rows that exist (29.9 review). mergeSeating
 * checks the OTHER side's seats against the merged tables, but the winning
 * side's own seats were kept as they were — so a guest seated at a table the
 * other device deleted stayed "seated" at nothing: left out of every
 * unassigned list and counted as seated. Applied at both exits of the merge.
 */
/* Everything the cloud-wins branch unions with this device's copy. When the
 * result differs from the cloud row in any of them, the device holds something
 * the cloud does not — a guest only it has, a tombstone, an arrival — and the
 * event must be pushed (fourth review 30.9: a guest kept by the union came out
 * version === syncedVersion, was never sent, and the sign-out prune deleted it
 * everywhere). Not eventSite or tokens: normalizeEvent mints ids for those on
 * the cloud side, so they would read as different on every login. */
const UNION_KEYS = ["guests", "tables", "constraints", "tasks", "vendors", "deletedRows", "seating",
  "lockedGuests", "lockedTables", "customGroups", "customTableTypes", "messagesSent", "rsvpApplied",
  "messageTemplates", "costs"];
function holdsMoreThanCloud(merged, cloudNormalized) {
  const c = pruneArrangement(cloudNormalized);
  if (UNION_KEYS.some(k => canonical(merged[k]) !== canonical(c[k]))) return true;
  // A rotation this device made and has not pushed: mergeTokens keeps the new
  // link, and the event came out "in step" — never sent, the cloud kept
  // serving the REVOKED link, and the sign-out prune then deleted the new one
  // (fifth review 30.9). Compared by the rotation record, which the cloud row
  // carries whole; the tokens themselves are minted per read when missing.
  if (canonical(merged.tokenRotations ?? {}) !== canonical(c.tokenRotations ?? {})) return true;
  if ((merged.tokensRotatedAt ?? null) !== (c.tokensRotatedAt ?? null)) return true;
  return canonical(merged.floorPlan?.tablePositions ?? {}) !== canonical(c.floorPlan?.tablePositions ?? {})
      || canonical(merged.floorPlan?.elements ?? []) !== canonical(c.floorPlan?.elements ?? []);
}

function pruneArrangement(ev) {
  const guestIds = new Set((ev.guests || []).map(g => g.id));
  const tableIds = new Set((ev.tables || []).map(t => t.id));
  const seating = Object.fromEntries(Object.entries(ev.seating || {})
    .filter(([gid, tid]) => guestIds.has(gid) && tableIds.has(tid)));
  const fp = ev.floorPlan;
  const positions = fp?.tablePositions
    ? Object.fromEntries(Object.entries(fp.tablePositions).filter(([tid]) => tableIds.has(tid)))
    : null;
  return {
    ...ev,
    seating,
    lockedGuests: (ev.lockedGuests || []).filter(id => guestIds.has(id)),
    lockedTables: (ev.lockedTables || []).filter(id => tableIds.has(id)),
    ...(fp && positions ? { floorPlan: { ...fp, tablePositions: positions } } : {}),
  };
}

/** Union two id lists, dropping ids that no longer exist after the merge. */
function unionIds(cloudIds, localIds, exists) {
  const out = [];
  for (const id of [...(cloudIds || []), ...(localIds || [])]) {
    if (!out.includes(id) && exists(id)) out.push(id);
  }
  return out;
}

/** Union two string lists, cloud order first. Used for customGroups. */
function unionStrings(cloudList, localList) {
  const out = [...(cloudList || [])];
  for (const v of localList || []) if (!out.includes(v)) out.push(v);
  return out;
}

function keepFilledCosts(winner, loser) {
  const has = v => Array.isArray(v?.categories) && v.categories.length > 0;
  return (!has(winner) && has(loser)) ? loser : winner;
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
/* After a push is acknowledged at server version `v`: the event is in step
 * with the cloud only if it has not changed since the snapshot that was sent
 * (`sentVersion`). An edit made while the push was on the wire must stay
 * unpushed — one past the new base — or the next push writes a version equal
 * to the one it replaces and a stale device is accepted over it; the conflict
 * retry used to set `version: v2` outright, which is exactly that (third
 * review 30.9, סב46). The server now also refuses to let the version go down
 * (migration 20260930000300), so `v` can be above what was sent. */
export function afterPush(e, sentVersion, v, syncBase = e.syncBase ?? null, sentUpdatedAt, sentEdits) {
  // The version counter alone is not proof: a merge while the push was on the
  // wire can reset it, and the next edit then lands on the SAME number as the
  // one sent — which read as "nothing changed since", marked the edit synced,
  // and nothing sent it (fourth review 30.9). The edit's timestamp settles it.
  const unchanged = e.version === sentVersion
    && (sentUpdatedAt === undefined || e.updatedAt === sentUpdatedAt)
    && (sentEdits === undefined || (e.localEdits ?? 0) === sentEdits);
  if (unchanged) return { ...e, syncedVersion: v, version: v, syncBase };
  return { ...e, syncedVersion: v, version: Math.max(e.version ?? 0, v + 1), syncBase };
}

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
  //
  // `force`: the local-wins branch below. There the local copy is NEWER than
  // the cloud's (its own updatedAt, stamped on this device, is later than the
  // one the cloud row carries — equal after any successful push), so by
  // definition the cloud does not hold it, whoever called. Left unmarked at
  // load, the counters could come out equal — the sign-out prune then deleted
  // an edit that existed only here (third review 30.9, סב46: add a guest, close
  // the tab inside the 1.5 s debounce, reopen, sign out — gone everywhere).
  const markUnpushed = (e, force = false) =>
    force || (unpushedIds && unpushedIds.has(e.id))
      ? { ...e, version: (Number.isFinite(e.syncedVersion) ? e.syncedVersion : 0) + 1 }
      : e;

  const merged = cloudEvents.map(ce => {
    const normalized = normalizeEvent(ce);
    // Floor plan image is never uploaded to cloud (base64 is too large).
    // Preserve whatever is in localStorage so the image survives hydration.
    const localMatch = localEvents.find(le =>
      le.id === ce.id || (le.cloudId && le.cloudId === ce.cloudId)
    );
    // A row OLDER than the one this device already synced with — a slow fetch
    // answering after a faster one (two conflict recoveries in flight). It says
    // nothing new, and read as "the cloud moved from the base" it put the
    // previous values back over the other device's edit (fourth review 30.9).
    //
    // Skipping it assumes the server version never goes DOWN, which is only
    // guaranteed once migration 20260930000300 (the monotone trigger) has run —
    // so that migration must be in place before this client is deployed. The
    // fifth review tried merging such rows instead (to un-freeze an event whose
    // version had gone down): the three-device fuzz lost single-editor edits in
    // two seeds that way, and zero with the skip.
    if (localMatch && Number.isFinite(localMatch.syncedVersion) && Number.isFinite(ce.syncedVersion)
        && ce.syncedVersion < localMatch.syncedVersion) {
      return normalizeEvent(localMatch);
    }
    // Both sides' tombstones, before either branch decides who wins on scalars.
    // A deletion recorded on either device is a deletion, and the branch that
    // loses on scalars still has to have its deletes honoured — otherwise which
    // device happened to edit the venue last would decide whether a guest the
    // OTHER device removed stays removed.
    const tombs = mergeTombstoneMaps(localMatch?.deletedRows, ce.deletedRows);
    // What is STORED is aged exactly as normalizeEvent ages the cloud row:
    // with an expired entry kept, the merged map always "held more than the
    // cloud" and the event was pushed on every load, forever (fifth review
    // 30.9). The raw map above still filters rows — ageing changes nothing
    // about which deletes the merge honours.
    const storedTombs = normalizeDeletedRows(tombs);
    // The row just read is, by definition, what the cloud holds at the
    // syncedVersion every branch below takes — so it is the next merge's base.
    const cloudBase = syncBaseOf(ce);

    // The cloud row is NOT automatically the truth. A write can fail (venue
    // wifi) or simply not have fired yet — the push is debounced 1500ms, so
    // closing the tab right after an edit leaves the cloud a step behind.
    // Taking the cloud copy wholesale in that state deleted the newer local
    // work and then persisted the deletion, which is unrecoverable. Whichever
    // side was written last wins; the cloud id always comes from the cloud.
    if (localMatch && (localMatch.updatedAt ?? 0) > (ce.updatedAt ?? 0)) {
      // The mirror of item 76 (28.9, WORKPLAN 107). The union below rescues the
      // guests and tables the OTHER device added — and until now dropped the
      // arrangement it gave them: seats, locks, floor-plan positions.
      // Measured: phone adds g2 + table t2 and seats g2 there; laptop renames
      // the venue later; the merge kept g2 and t2 and returned seating {g1}.
      // The rule is 76's, the other way round: the winning side keeps every
      // decision about rows it KNOWS (an unseating here stays an unseating);
      // only rows it has never seen take the other side's arrangement.
      const localGuestIds = new Set((localMatch.guests || []).map(g => g.id));
      const localTableIds = new Set((localMatch.tables || []).map(t => t.id));
      const mergedTables  = unionById(localMatch.tables, ce.tables, tombs.tables);
      const mergedGuests  = mergeArrivals(unionById(localMatch.guests, ce.guests, tombs.guests), ce.guests);
      const tableIdsAll   = new Set(mergedTables.map(t => t.id));
      const guestIdsAll   = new Set(mergedGuests.map(g => g.id));
      const newFromCloud  = (ids, known, exists) =>
        (ids || []).filter(id => !known.has(id) && exists.has(id));
      const localPositions = localMatch.floorPlan?.tablePositions || {};
      const cloudPositions = ce.floorPlan?.tablePositions || {};
      const extraPositions = Object.fromEntries(Object.entries(cloudPositions)
        .filter(([tid]) => !localTableIds.has(tid) && !(tid in localPositions) && tableIdsAll.has(tid)));
      const localWon = {
        ...localMatch,
        seating: mergeSeating(localMatch.seating, ce.seating,
                              (id) => localGuestIds.has(id), (id) => tableIdsAll.has(id)),
        lockedGuests: [...(localMatch.lockedGuests || []).filter(id => guestIdsAll.has(id)),
                       ...newFromCloud(ce.lockedGuests, localGuestIds, guestIdsAll)],
        lockedTables: [...(localMatch.lockedTables || []).filter(id => tableIdsAll.has(id)),
                       ...newFromCloud(ce.lockedTables, localTableIds, tableIdsAll)],
        customGroups: unionStrings(localMatch.customGroups, ce.customGroups),
        customTableTypes: unionStrings(localMatch.customTableTypes, ce.customTableTypes),
        // A null floor plan here means this device never opened it — not a
        // deletion (nothing sets it to null). Winning on scalars must not throw
        // the other device's plan, positions and fixtures away and then push
        // the null (29.9 review).
        ...(localMatch.floorPlan
          ? (Object.keys(extraPositions).length ? {
              floorPlan: { ...localMatch.floorPlan, tablePositions: { ...localPositions, ...extraPositions } },
            } : {})
          : (ce.floorPlan ? { floorPlan: ce.floorPlan } : {})),
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
        deletedRows: storedTombs,
        guests: mergedGuests,
        // Tables too: a second device adding tables is the same shape of loss,
        // and an unseated guest is recoverable while a deleted table is not.
        // (Seating, locks and positions for those rows: see the top of this
        // branch. They used to stay local-only, which dropped the other
        // device's arrangement of rows this device had never seen.)
        tables: mergedTables,
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
        // Applied is a one-way fact: an id applied on EITHER device stays applied.
        rsvpApplied:      unionStrings(ce.rsvpApplied, localMatch.rsvpApplied),
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
        tokenRotations: mergeRotations(ce.tokenRotations, localMatch.tokenRotations),
        tokens: mergeTokens(ce.tokens, localMatch.tokens, null,
                            ce.tokensRotatedAt, localMatch.tokensRotatedAt,
                            ce.tokenRotations, localMatch.tokenRotations),
      };
      // Newer is not the same as "changed everything": a field only the cloud
      // moved since the last sync takes the cloud's value (סב55, syncBase.js).
      const { event: scalarsMerged } = threeWayScalars(localWon, localMatch, ce, localMatch.syncBase);
      return markUnpushed(pruneArrangement(normalizeEvent({
        ...scalarsMerged, syncBase: cloudBase,
      })), true);
    }

    let result = { ...normalized, syncBase: cloudBase };
    let localKept = false;

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
      const guests = mergeArrivals(unionById(result.guests, localMatch.guests, tombs.guests), localMatch.guests);
      const tables = unionById(result.tables, localMatch.tables, tombs.tables);

      // Who the CLOUD knows, computed before the union, so "the cloud has no
      // opinion about this guest" is answerable. After the union everything
      // looks known.
      const cloudGuestIds = new Set((result.guests || []).map(g => g.id));
      const cloudTableIds = new Set((result.tables || []).map(t => t.id));
      const tableIds      = new Set(tables.map(t => t.id));
      const guestIds      = new Set(guests.map(g => g.id));

      result = {
        ...result,
        deletedRows: storedTombs,
        guests,
        tables,
        constraints: unionById(result.constraints, localMatch.constraints, tombs.constraints),
        tasks:       unionById(result.tasks,       localMatch.tasks,       tombs.tasks),
        vendors:     unionById(result.vendors,     localMatch.vendors,     tombs.vendors),
        messagesSent:     mergeSentMaps(result.messagesSent, localMatch.messagesSent),
        rsvpApplied:      unionStrings(result.rsvpApplied, localMatch.rsvpApplied),
        messageTemplates: unionByKey(result.messageTemplates, localMatch.messageTemplates),
        costs:            keepFilledCosts(result.costs, localMatch.costs),
        // Everything below is the ARRANGEMENT around those rows. Keeping a
        // rescued table while dropping its seat, its lock and its position on
        // the floor plan leaves the host a table nobody sits at and no way to
        // tell that from having forgotten to seat it. See mergeSeating.
        seating: mergeSeating(result.seating, localMatch.seating,
                              (id) => cloudGuestIds.has(id), (id) => tableIds.has(id)),
        // Locks: the cloud's, plus this tab's for rows the cloud has never seen.
        // A plain union brought back a lock the OTHER device had removed — the
        // host unlocks a table on the phone, and the laptop's stale copy locks
        // it again on its next load (107, 29.9). Same rule as seating.
        lockedGuests: unionIds(result.lockedGuests,
                               (localMatch.lockedGuests || []).filter(id => !cloudGuestIds.has(id)),
                               (id) => guestIds.has(id)),
        lockedTables: unionIds(result.lockedTables,
                               (localMatch.lockedTables || []).filter(id => !cloudTableIds.has(id)),
                               (id) => tableIds.has(id)),
        customGroups: unionStrings(result.customGroups, localMatch.customGroups),
        customTableTypes: unionStrings(result.customTableTypes, localMatch.customTableTypes),
        // This device's own edit count — never the cloud's (it has none).
        localEdits: localMatch.localEdits ?? 0,
      };
      // The mirror of the local-wins case: the cloud copy is newer, but a field
      // only THIS device moved since the last sync is this device's edit, not
      // something the cloud overruled (סב55). Kept, and marked for pushing.
      const tw = threeWayScalars(result, localMatch, ce, localMatch.syncBase);
      result = tw.event;
      localKept = tw.localKept;
    }

    // Positions for tables the cloud has never seen. The rescue below only fires
    // when this device happens to hold the floor-plan IMAGE, so a table added
    // here kept its seat and its lock and still had no place on the plan.
    if (localMatch?.floorPlan?.tablePositions && result.floorPlan) {
      const known = result.floorPlan.tablePositions || {};
      // Only tables the cloud has never SEEN. A table the cloud knows but has
      // no position for was taken off the plan on the other device — the same
      // rule as seats and locks (29.9 review; it came back before).
      const cloudKnows = new Set((normalized.tables || []).map(t => t.id));
      const extra = {};
      for (const [tid, pos] of Object.entries(localMatch.floorPlan.tablePositions)) {
        if (!(tid in known) && !cloudKnows.has(tid)) extra[tid] = pos;
      }
      if (Object.keys(extra).length) {
        result = { ...result, floorPlan: { ...result.floorPlan, tablePositions: { ...known, ...extra } } };
      }
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
        tokenRotations: mergeRotations(ce.tokenRotations, localMatch.tokenRotations),
        tokens: mergeTokens(ce.tokens, localMatch.tokens, result.tokens,
                            ce.tokensRotatedAt, localMatch.tokensRotatedAt,
                            ce.tokenRotations, localMatch.tokenRotations) };
    }
    // Applied at BOTH exits. The local-wins branch above returns early, and
    // putting this only here silently skipped the exact case it is for.
    if (!localMatch) return result;
    const pruned = pruneArrangement(result);
    return markUnpushed(pruned, localKept || holdsMoreThanCloud(pruned, normalized));
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
  // Bumped when a load from the cloud has merged — the cue to send what this
  // device holds and the cloud does not (see pushUnpushed).
  const [loadedTick, setLoadedTick] = useState(0);

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
        // Then send what this device holds and the cloud does not — an edit
        // made before the tab closed, or offline. The load never pushed, so it
        // waited for the next edit (סב46). After the render that applies the
        // merge, so the push reads the merged events.
        setLoadedTick(t => t + 1);
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
        const base = syncBaseOf(ev);
        setEvents(prev => prev.map(e => e.id === ev.id ? afterPush(e, ev.version, version, base, ev.updatedAt, ev.localEdits ?? 0) : e));
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
          const mergeOpts = {
            cloudIsAuthoritative: cloudEvents.length < CLOUD_EVENTS_LIMIT,
            fetchedAt,
            // We are here BECAUSE the server rejected this event's write, so
            // this device is holding content the cloud does not have. See the
            // long note on the option in mergeCloudWithLocal.
            unpushedIds: new Set([ev.id]),
          };
          const next = mergeCloudWithLocal(eventsRef.current, cloudEvents, mergeOpts);
          // The STATE is merged against the latest state, not the snapshot
          // above: eventsRef only catches up after a render, so a second
          // recovery (or an edit) landing in the same tick was overwritten by
          // `setEvents(next)` (fourth review 30.9). `next` is only the copy
          // pushed below — and afterPush compares timestamps, so where the two
          // differ the event simply stays owed to the cloud.
          setEvents(prev => mergeCloudWithLocal(prev, cloudEvents, mergeOpts));
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
                const base = syncBaseOf(mergedThis);
                setEvents(prev => prev.map(e =>
                  e.id === ev.id ? afterPush(e, mergedThis.version, v2, base, mergedThis.updatedAt, mergedThis.localEdits ?? 0) : e));
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
            const base = syncBaseOf(normalized);
            setEvents(prev => prev.map(e =>
              e.id === normalized.id ? { ...e, cloudId, syncedVersion: version, syncBase: base } : e));
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

  /* One event's cloud write, now. The debounce below calls it 1.5 s after the
   * last edit; so do the moments a phone is about to stop running this tab —
   * hidden, closed — and the moment the network comes back (third review
   * 30.9, סב46). Before, an edit made inside the debounce and then the tab
   * closed was never sent at all, and an offline edit waited for the NEXT edit
   * after the signal returned; the load did not push either. */
  const pushNow = useCallback((id) => {
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
          const base = syncBaseOf(ev);
          setEvents(prev => prev.map(e =>
            e.id === id ? { ...e, cloudId, syncedVersion: version, syncBase: base } : e));
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

    // The cloud already holds this exact version — the same predicate the
    // sign-out prune trusts (isCloudBacked). A debounce that fired for a patch
    // which changed nothing has nothing to send (סב56).
    if (ev.version === ev.syncedVersion) return;
    setSyncStatus(SYNC_STATUS.SYNCING);
    pushUpdate(ev, currentUser.id);
  }, [pushUpdate]);
  const pushNowRef = useRef(pushNow);
  useEffect(() => { pushNowRef.current = pushNow; }, [pushNow]);

  // Send what is pending: every debounce still running, and every event this
  // device holds that the cloud does not (version ahead of the base).
  const flushPending = useCallback(() => {
    for (const id of Object.keys(syncTimers.current)) {
      clearTimeout(syncTimers.current[id]);
      delete syncTimers.current[id];
      pushNowRef.current(id);
    }
  }, []);
  // Only events the cloud already has a row for. An event with no cloudId is
  // either a draft that arrived from the logged-out bucket — uploading it at
  // sign-in, before the import banner asks, would put someone else's draft on a
  // shared computer into this account — or a failed create, which the next
  // edit retries as before.
  const pushUnpushed = useCallback(() => {
    for (const e of eventsRef.current) {
      if (syncTimers.current[e.id]) continue;
      if (e.cloudId && e.version !== e.syncedVersion) pushNowRef.current(e.id);
    }
  }, []);
  // After each load from the cloud (loadedTick), once the merge has rendered.
  useEffect(() => { if (loadedTick) pushUnpushed(); }, [loadedTick, pushUnpushed]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushPending(); };
    const onOnline = () => { flushPending(); pushUnpushed(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushPending);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushPending);
      window.removeEventListener("online", onOnline);
    };
  }, [flushPending, pushUnpushed]);

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
      // A function patch that hands the row back untouched changed nothing —
      // no new version, no updatedAt, nothing owed to the cloud (סב56).
      if (patched === e) return e;
      return updateEventTimestamp(withTombstones(e, freeDeclinedSeats(e, patched)));
    }));

    // Debounce cloud writes so rapid-fire patches (e.g. typing in a field)
    // don't generate one request per keystroke.
    clearTimeout(syncTimers.current[id]);
    syncTimers.current[id] = setTimeout(() => { delete syncTimers.current[id]; pushNowRef.current(id); }, 1500);
  }, []);

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
