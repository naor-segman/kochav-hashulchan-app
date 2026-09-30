/* Adversarial multi-device harness (scratch — not for commit).
 *
 * One module graph, one React. Devices are told apart by their user id:
 * "u1#A", "u1#B", "u1#C" are the SAME account to the fake cloud (the suffix is
 * stripped) but different localStorage keys to the hook — so each device has
 * its own bucket, and every cloud call carries the device that made it (for
 * the per-device network switch). Real mappers, real optimistic concurrency,
 * the real monotone-version trigger rule.
 */
export function makeCloud(actual, devices) {
  const cloud = {
    rows: new Map(),           // cloudId -> db row (JSON)
    history: new Map(),        // cloudId -> Map(version -> db row)
    violations: [],
    writes: 0,
    maxLat: 0,
    rand: Math.random,
    wait() { return this.maxLat ? new Promise(r => setTimeout(r, Math.floor(this.rand() * this.maxLat))) : Promise.resolve(); },
    reset() { this.rows = new Map(); this.history = new Map(); this.violations = []; this.writes = 0; },
    store(row) {
      const json = JSON.stringify(row);
      if (json.includes("syncBase")) this.violations.push({ kind: "syncBase-in-cloud", id: row.id });
      const copy = JSON.parse(json);
      this.rows.set(row.id, copy);
      if (!this.history.has(row.id)) this.history.set(row.id, new Map());
      this.history.get(row.id).set(copy.version, copy);
      this.writes++;
    },
  };
  const dev = (uid) => devices[String(uid).split("#")[1]];
  const net = (uid) => { if (dev(uid)?.offline) throw new Error("Failed to fetch"); };
  const log = (uid, s) => dev(uid)?.log?.push(s);
  cloud.api = {
    fetchCloudEvents: async (uid) => {
      net(uid);
      const out = [...cloud.rows.values()]
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        .map(r => actual.mapCloudEventToLocalEvent(JSON.parse(JSON.stringify(r))));
      log(uid, `fetch ${out.map(e => e.id + "@v" + e.version).join(",")}`);
      await cloud.wait();
      return out;
    },
    createCloudEvent: async (e, uid) => {
      net(uid);
      const row = actual.mapLocalEventToCloudPayload(e, "u1");
      const id = "c-" + e.id;
      if (cloud.rows.has(id)) { await cloud.wait(); throw new Error("duplicate key"); }
      cloud.store({ ...row, id, created_at: new Date(1_790_000_000_000).toISOString() });
      log(uid, `create ${e.id} v${row.version}`);
      await cloud.wait();
      return { cloudId: id, version: row.version };
    },
    updateCloudEvent: async (e, uid) => {
      net(uid);
      if (!e.cloudId) throw new Error("missing cloudId");
      const row = actual.mapLocalEventToCloudPayload(e, "u1");
      const base = Number.isFinite(e.syncedVersion) ? e.syncedVersion : null;
      const old = cloud.rows.get(e.cloudId);
      if (!old || (base !== null && old.version !== base)) {
        log(uid, `update ${e.id} CONFLICT base=${base} row=${old?.version}`);
        await cloud.wait();
        if (base !== null) throw new actual.CloudConflictError();
        return row.version;
      }
      const v = (row.version == null || row.version <= old.version) ? old.version + 1 : row.version;
      cloud.store({ ...old, ...row, id: e.cloudId, version: v });
      log(uid, `update ${e.id} base=${base} sent=${e.version} -> v${v}`);
      await cloud.wait();
      return v;
    },
    deleteCloudEvent: async (cloudId, uid) => { net(uid); cloud.rows.delete(cloudId); },
  };
  return cloud;
}
