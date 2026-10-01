/* The randomized multi-device run. Scratch — not for commit. */
import { vi } from "vitest";
import { mapCloudEventToLocalEvent } from "../../utils/cloudSync.js";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIELDS = ["venue", "name", "date", "story", "costs"];

export function fieldOf(ev, f) {
  if (!ev) return undefined;
  if (f === "story") return ev.eventSite?.story ?? "";
  if (f === "costs") return ev.costs?.categories?.[0]?.name ?? "";
  if (f === "date") return ev.date || "";
  if (f === "cap") return String((ev.tables || []).find(t => t.id === "t1")?.capacity ?? "");
  return ev[f] ?? "";
}
function patchFor(f, val) {
  if (f === "story") return (e) => ({ ...e, eventSite: { ...e.eventSite, story: val } });
  if (f === "costs") return { costs: { categories: [{ id: "cat1", name: val, amount: 100 }] } };
  if (f === "cap") return (e) => ({ ...e, tables: e.tables.map(t => t.id === "t1" ? { ...t, capacity: Number(val) } : t) });
  return { [f]: val };
}

export async function runSeed(seed, devs, cloud, env, opts = {}) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const { act, renderHook, useEvents, isCloudBacked } = env;
  const T0 = Date.now();
  const steps = opts.steps ?? 40;
  const trace = [];
  const failures = [];
  let counter = 0;

  cloud.reset();
  cloud.maxLat = opts.latency ?? 0;
  cloud.rand = rng(seed * 7919 + 1);
  for (const d of devs) {
    localStorage.removeItem(d.key); d.offline = false; d.hook = null; d.log = [];
    d.skew = opts.skew ? Math.round((r() - 0.5) * opts.skew) : 0;
  }
  const EVENTS = opts.events ?? ["E1", "E2"];
  // SIM_SEAT=1: also seat/unseat guests and edit a table's capacity (ב2).
  // Off by default, so the default seeds replay exactly as before.
  const SEAT = !!opts.seating;
  const FIELDS_ = SEAT ? [...FIELDS, "cap"] : FIELDS;
  const TABLES = ["t1", "t2", "t3"];
  const ledger = {
    scalar: {},    // ev -> field -> [{dev, val}]
    added: {},     // ev -> gid -> dev
    deleted: {},   // ev -> gid -> true
    seat: {},      // ev -> gid -> [{dev, val}]
  };
  for (const e of EVENTS) { ledger.scalar[e] = {}; ledger.added[e] = {}; ledger.deleted[e] = {}; ledger.seat[e] = {}; }

  const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const mount = async (d) => {
    d.hook = renderHook(() => useEvents(d.user));
    await settle(); await settle();
  };
  const unmount = (d) => { d.hook.unmount(); d.hook = null; };
  const cur = (d, id) => d.hook?.result.current.events.find(e => e.id === id);
  const edit = (d, fn) => {
    const now = Date.now();
    if (d.skew) vi.setSystemTime(now + d.skew);
    try { act(fn); } finally { if (d.skew) vi.setSystemTime(now); }
  };
  const cloudRowFor = (id) => cloud.rows.get("c-" + id);

  // ── check (e): a cloud-backed local copy must be a subset of the cloud's
  // copy AT ITS syncedVersion — otherwise the sign-out prune deletes content
  // nobody else has.
  const lacks = (ev) => {
    const hist = cloud.history.get(ev.cloudId);
    const row = hist?.get(ev.syncedVersion);
    if (!row) return `no cloud history for v${ev.syncedVersion}`;
    const ce = mapCloudEventToLocalEvent(row);
    const out = [];
    for (const f of FIELDS_) if (fieldOf(ev, f) !== fieldOf(ce, f)) out.push(`${f}: local=${JSON.stringify(fieldOf(ev, f))} cloud=${JSON.stringify(fieldOf(ce, f))}`);
    if (SEAT) for (const g of ev.guests) {
      if ((ev.seating[g.id] ?? null) !== (ce.seating[g.id] ?? null)) out.push(`seat ${g.id} local=${ev.seating[g.id]} cloud=${ce.seating[g.id]}`);
    }
    const cg = new Map(ce.guests.map(g => [g.id, g.notes || ""]));
    for (const g of ev.guests) {
      if (!cg.has(g.id)) out.push(`guest ${g.id} only local`);
      else if (cg.get(g.id) !== (g.notes || "")) out.push(`guest ${g.id} notes local=${g.notes} cloud=${cg.get(g.id)}`);
    }
    return out.length ? out.join("; ") : null;
  };
  const checkE = (d, where) => {
    const evs = d.hook ? d.hook.result.current.events
      : (JSON.parse(localStorage.getItem(d.key) || '{"events":[]}').events);
    for (const ev of evs) {
      if (!isCloudBacked(ev)) continue;
      const why = lacks(ev);
      if (why) failures.push({ kind: "E-cloudBacked-but-cloud-lacks", dev: d.name, ev: ev.id, where, why });
    }
  };

  // ── setup: A creates the events online; everyone hydrates.
  const A = devs[0];
  await mount(A);
  for (const id of EVENTS) {
    await act(async () => { A.hook.result.current.addEvent({ id, name: `init-${id}`, type: "חתונה", date: "2027-01-01", venue: "init-venue",
      guests: [{ id: `g0-${id}`, name: "ראשון", count: 1 }], costs: { categories: [{ id: "cat1", name: "init-cost", amount: 1 }] },
      ...(SEAT ? { tables: TABLES.map(t => ({ id: t, name: t, capacity: 10 })) } : {}) }); });
    await settle(); await settle(10);
  }
  await settle(2000);
  for (const d of devs.slice(1)) { await mount(d); }
  await settle(2000);
  const initial = {};
  for (const id of EVENTS) {
    initial[id] = Object.fromEntries(FIELDS_.map(f => [f, fieldOf(cur(A, id), f)]));
  }

  // ── random steps
  for (let s = 0; s < steps; s++) {
    const d = pick(devs);
    const x = r();
    if (!d.hook) { trace.push(`${d.name}: mount${d.offline ? " (offline)" : ""}`); await mount(d); checkE(d, `step ${s} mount`); continue; }
    const id = pick(EVENTS);
    const e = cur(d, id);
    if (x < 0.30 && e) {
      const f = pick(FIELDS_);
      const n = ++counter;
      const v = f === "date" ? `${2030 + n}-06-15` : f === "cap" ? String(10 + n) : `${d.name}-${f}-${n}`;
      (ledger.scalar[id][f] ??= []).push({ dev: d.name, val: v, s });
      trace.push(`${d.name}: edit ${id}.${f}=${v}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, patchFor(f, v)); });
    } else if (x < 0.45 && e) {
      const gid = `g-${d.name}-${++counter}`;
      ledger.added[id][gid] = d.name;
      trace.push(`${d.name}: add guest ${id}/${gid}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, (ev) => ({ ...ev, guests: [...ev.guests, { id: gid, name: gid, count: 1 }] })); });
    } else if (x < 0.53 && e && e.guests.length) {
      const g = pick(e.guests);
      const note = `${d.name}-note-${++counter}`;
      trace.push(`${d.name}: note ${id}/${g.id}=${note}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, (ev) => ({ ...ev, guests: ev.guests.map(x2 => x2.id === g.id ? { ...x2, notes: note } : x2) })); });
    } else if (x < 0.59 && e && e.guests.length) {
      const g = pick(e.guests);
      ledger.deleted[id][g.id] = true;
      trace.push(`${d.name}: delete guest ${id}/${g.id}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, (ev) => ({ ...ev, guests: ev.guests.filter(x2 => x2.id !== g.id) })); });
    } else if (SEAT && x < 0.62 && e && e.guests.length) {
      const g = pick(e.guests);
      const t = pick([...TABLES, null]);
      (ledger.seat[id][g.id] ??= []).push({ dev: d.name, val: t, s });
      trace.push(`${d.name}: seat ${id}/${g.id}=${t}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, (ev) => {
        const seating = { ...ev.seating };
        if (t) seating[g.id] = t; else delete seating[g.id];
        return { ...ev, seating };
      }); });
    } else if (x < 0.62 && e) {
      trace.push(`${d.name}: no-op patch ${id}`);
      edit(d, () => { d.hook.result.current.patchEventById(id, (ev) => ev); });
    } else if (x < 0.72) {
      const ms = Math.floor(100 + r() * 1300);
      trace.push(`time +${ms}`);
      await settle(ms);
    } else if (x < 0.80) {
      const ms = Math.floor(1600 + r() * 4000);
      trace.push(`time +${ms}`);
      await settle(ms);
    } else if (x < 0.86) {
      d.offline = !d.offline;
      trace.push(`${d.name}: ${d.offline ? "offline" : "online"}`);
      if (!d.offline) { act(() => { window.dispatchEvent(new Event("online")); }); await settle(); await settle(); }
    } else if (x < 0.93) {
      const hide = r() < 0.5;
      trace.push(`${d.name}: reload${hide ? " (pagehide)" : ""}`);
      if (hide) { act(() => { window.dispatchEvent(new Event("pagehide")); }); }
      unmount(d);
      await settle();
      await mount(d);
    } else if (x < 0.96) {
      trace.push(`${d.name}: close tab`);
      unmount(d);
      await settle();
    } else {
      // Sign out: the real useAuth runs pruneCloudBackedEvents on SIGNED_OUT.
      trace.push(`${d.name}: sign-out`);
      unmount(d);
      await settle();
      const key = d.key;
      const all = JSON.parse(localStorage.getItem(key) || '{"events":[]}').events;
      for (const ev of all) {
        if (isCloudBacked(ev)) {
          const why = lacks(ev);
          if (why) failures.push({ kind: "PRUNE-DELETED-UNPUSHED", dev: d.name, ev: ev.id, where: `step ${s}`, why });
        }
      }
      const kept = all.filter(ev => !isCloudBacked(ev));
      if (kept.length) localStorage.setItem(key, JSON.stringify({ events: kept })); else localStorage.removeItem(key);
    }
    if (opts.tick) await settle(Math.floor(5 + r() * opts.tick));
    for (const dd of devs) if (dd.hook) checkE(dd, `step ${s}`);
    if (opts.verbose) {
      const st = (ev) => ev ? `v${ev.version}/s${ev.syncedVersion} g[${ev.guests.map(g => g.id).join(",")}] u${ev.updatedAt - T0} {${FIELDS.map(f => fieldOf(ev, f)).join("|")}}` : "-";
      const parts = devs.map(dd => {
        const evs = dd.hook ? dd.hook.result.current.events : JSON.parse(localStorage.getItem(dd.key) || '{"events":[]}').events;
        return `${dd.name}${dd.hook ? "" : "(closed)"}${dd.offline ? "(off)" : ""}: ` + EVENTS.map(id => `${id} ${st(evs.find(e => e.id === id))}`).join(" ; ");
      });
      const cl = EVENTS.map(id => { const rw = cloudRowFor(id); const ce = rw && mapCloudEventToLocalEvent(rw); return `${id} v${rw?.version} g[${(rw?.payload.guests || []).map(g => g.id).join(",")}] u${rw ? rw.payload.updatedAt - T0 : "-"} {${FIELDS.map(f => fieldOf(ce, f)).join("|")}}`; }).join(" ; ");
      trace.push("    " + parts.join("\n    ") + "\n    CLOUD: " + cl);
    }
  }

  // ── converge: everyone online, each device reloads, a few rounds.
  trace.push('--- converge ---');
  for (const d of devs) { d.offline = false; if (d.hook) unmount(d); }
  await settle(2000);
  let converged = false;
  for (let round = 0; round < 5 && !converged; round++) {
    const before = cloud.writes;
    for (const d of devs) {
      await mount(d);
      await settle(2000); await settle(2000);
      checkE(d, `converge r${round}`);
      unmount(d);
      await settle(100);
    }
    if (cloud.writes === before) converged = true;
  }
  // Final state as each device holds it, and the cloud's.
  const finalFor = {};
  for (const d of devs) {
    await mount(d); await settle(2000);
    finalFor[d.name] = Object.fromEntries(EVENTS.map(id => [id, cur(d, id)]));
    unmount(d);
  }
  if (!converged) failures.push({ kind: "no-convergence", writes: cloud.writes });

  for (const id of EVENTS) {
    const row = cloudRowFor(id);
    const ce = row ? mapCloudEventToLocalEvent(row) : null;
    if (!ce) { failures.push({ kind: "event-missing-in-cloud", ev: id }); continue; }
    for (const d of devs) {
      const le = finalFor[d.name][id];
      if (!le) { failures.push({ kind: "event-missing-on-device", dev: d.name, ev: id }); continue; }
      for (const f of FIELDS_) if (fieldOf(le, f) !== fieldOf(ce, f))
        failures.push({ kind: "diverged", dev: d.name, ev: id, f, local: fieldOf(le, f), cloud: fieldOf(ce, f) });
      const lg = le.guests.map(g => g.id).sort().join(","), cg = ce.guests.map(g => g.id).sort().join(",");
      if (lg !== cg) failures.push({ kind: "diverged-guests", dev: d.name, ev: id, local: lg, cloud: cg });
    }
    // (a)/(b)
    for (const f of FIELDS_) {
      const edits = ledger.scalar[id][f] || [];
      if (!edits.length) {
        if (fieldOf(ce, f) !== initial[id][f]) failures.push({ kind: "untouched-field-changed", ev: id, f, final: fieldOf(ce, f) });
        continue;
      }
      const byDev = {};
      for (const e of edits) byDev[e.dev] = e.val;
      const devsTouched = Object.keys(byDev);
      const final = fieldOf(ce, f);
      if (devsTouched.length === 1) {
        if (final !== byDev[devsTouched[0]]) failures.push({ kind: "A-single-editor-lost", ev: id, f, expected: byDev[devsTouched[0]], final, edits });
      } else {
        if (final === initial[id][f] || !edits.some(e => e.val === final))
          failures.push({ kind: "B-conflict-not-an-edit", ev: id, f, final, edits });
        else if (!Object.values(byDev).includes(final))
          failures.push({ kind: "B-conflict-stale-edit", ev: id, f, final, lastPerDev: byDev, edits });
      }
    }
    // (c)
    const finalIds = new Set(ce.guests.map(g => g.id));
    for (const [gid, dev] of Object.entries(ledger.added[id])) {
      if (!ledger.deleted[id][gid] && !finalIds.has(gid)) failures.push({ kind: "C-guest-lost", ev: id, gid, addedBy: dev });
    }
    // (s) a seat only one device set must be the final seat (ב2)
    for (const [gid, edits] of Object.entries(ledger.seat[id])) {
      if (ledger.deleted[id][gid] || !finalIds.has(gid)) continue;
      const byDev = {};
      for (const e of edits) byDev[e.dev] = e.val;
      const final = ce.seating[gid] ?? null;
      const devsTouched = Object.keys(byDev);
      if (devsTouched.length === 1 && final !== byDev[devsTouched[0]])
        failures.push({ kind: "S-single-editor-seat-lost", ev: id, gid, expected: byDev[devsTouched[0]], final, edits });
      else if (devsTouched.length > 1 && !Object.values(byDev).includes(final))
        failures.push({ kind: "S-conflict-stale-seat", ev: id, gid, final, lastPerDev: byDev });
    }
    for (const gid of Object.keys(ledger.deleted[id])) {
      if (finalIds.has(gid)) failures.push({ kind: "info-deleted-guest-back", ev: id, gid });
    }
  }
  for (const v of cloud.violations) failures.push({ kind: "D-" + v.kind, ...v });
  return { failures, trace, skews: devs.map(d => d.skew) };
}
