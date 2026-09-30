// @vitest-environment jsdom
/* Three devices on one account against a fake cloud that uses the real
 * mappers, the real version check (CloudConflictError on a stale base) and the
 * server's version-only-goes-up rule; random edits, offline spells, reloads,
 * closed tabs and sign-outs, then everyone reloads online and the invariants
 * are checked (no single-editor edit lost, no guest lost, the cloud never
 * holds syncBase, nothing marked synced that the cloud lacks). Written by the
 * fourth review (30.9); it found סב67.
 *
 *   npx vitest run src/hooks/syncFuzz                     # 30 seeds, in the gate
 *   SIM_COUNT=2000 SIM_LAT=400 SIM_TICK=150 npx vitest run src/hooks/syncFuzz
 *   SIM_OUT=out.json …                                    # failing seeds + traces
 *
 * Measured 30.9 at 2,000 seeds: 740 failing before סב67, 11 after — all one
 * open class (two devices editing a field of the same guest).
 */
import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import fs from "node:fs";

vi.mock("../../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock("../../utils/cloudSync.js", async (orig) => {
  const actual = await orig();
  const api = (k) => (...a) => globalThis.__advCloud.api[k](...a);
  return {
    ...actual,
    fetchCloudEvents: api("fetchCloudEvents"),
    createCloudEvent: api("createCloudEvent"),
    updateCloudEvent: api("updateCloudEvent"),
    deleteCloudEvent: api("deleteCloudEvent"),
  };
});

const { renderHook, act } = await import("@testing-library/react");
const actual = await vi.importActual("../../utils/cloudSync.js");
const { makeCloud } = await import("./harness.js");
const { runSeed } = await import("./sim.js");
const HOOK = process.env.SIM_HOOK || "../useEvents.js";
const { useEvents } = await import(/* @vite-ignore */ HOOK);
const { isCloudBacked } = await import("../../utils/storage.js");

const FROM  = Number(process.env.SIM_FROM ?? 1);
const COUNT = Number(process.env.SIM_COUNT ?? 30);
const STEPS = Number(process.env.SIM_STEPS ?? 40);
const SKEW  = Number(process.env.SIM_SKEW ?? 0);
const NDEV  = Number(process.env.SIM_DEVS ?? 3);
const OUT   = process.env.SIM_OUT ?? null;
const ONLY  = process.env.SIM_ONLY ? process.env.SIM_ONLY.split(",").map(Number) : null;

const devices = {};
const devs = ["A", "B", "C"].slice(0, NDEV).map(name => {
  const d = { name, user: { id: "u1#" + name }, key: `kochav_hashulchan_v1::u_u1#${name}`, offline: false, skew: 0, log: [] };
  devices[name] = d;
  return d;
});
const cloud = makeCloud(actual, devices);
globalThis.__advCloud = cloud;

beforeAll(() => { vi.useFakeTimers({ now: 1_790_000_000_000 }); });
afterAll(() => { vi.useRealTimers(); });

describe("multi-device fuzz", () => {
  it(`seeds ${FROM}..${FROM + COUNT - 1}`, async () => {
    const summary = { hook: HOOK, skew: SKEW, steps: STEPS, seeds: 0, failing: 0, failingSeeds: {}, kinds: {}, examples: {} };
    const seeds = ONLY ?? Array.from({ length: COUNT }, (_, i) => FROM + i);
    for (const seed of seeds) {
      let res;
      try {
        res = await runSeed(seed, devs, cloud, { act, renderHook, useEvents, isCloudBacked }, { steps: STEPS, skew: SKEW, verbose: !!process.env.SIM_VERBOSE, latency: Number(process.env.SIM_LAT ?? 0), tick: Number(process.env.SIM_TICK ?? 0) });
      } catch (err) {
        res = { failures: [{ kind: "harness-throw", msg: String(err?.stack || err).slice(0, 600) }], trace: [] };
        for (const d of devs) { try { d.hook?.unmount(); } catch { /* */ } d.hook = null; }
      }
      summary.seeds++;
      const real = res.failures.filter(f => !f.kind.startsWith("info-"));
      if (real.length) summary.failing++;
      const kindsSeen = new Set();
      for (const f of res.failures) {
        summary.kinds[f.kind] = (summary.kinds[f.kind] || 0) + 1;
        if (kindsSeen.has(f.kind)) continue;
        kindsSeen.add(f.kind);
        (summary.failingSeeds[f.kind] ??= []).push(seed);
        const ex = (summary.examples[f.kind] ??= []);
        if (ex.length < 3) ex.push({ seed, f, all: res.failures.filter(x => x.kind === f.kind).slice(0, 5), trace: res.trace, skews: res.skews, log: devs.map(d => d.name + ": " + d.log.slice(-25).join(" | ")) });
      }
    }
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
    console.log("SUMMARY " + JSON.stringify({ hook: HOOK, seeds: summary.seeds, failing: summary.failing, kinds: summary.kinds }));
    expect(summary.seeds).toBe(seeds.length);
    // In the gate: the default seeds must all hold. A deep run reports instead.
    if (!process.env.SIM_COUNT && !ONLY) expect(summary.failing, JSON.stringify(summary.failingSeeds)).toBe(0);
  }, 3_600_000);
});
