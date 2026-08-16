import { describe, it, expect, vi, beforeEach } from "vitest";

// WHY THIS FILE EXISTS
//
// cloudSync.test.js and cloudRoundTrip.test.js cover the two pure mappers, and
// cover them well — a mutation run killed 54 of 61 mapper mutants, including
// every field-drop. But every test in the repo that touches the CRUD functions
// MOCKS them (useEventsState.test.jsx, useMigration.test.jsx), so the real
// bodies of updateCloudEvent / deleteCloudEvent / fetchCloudEvents had never
// executed once, and no test had ever made a push reject.
//
// Ten mutants survived on that one mechanism. It is the optimistic-concurrency
// guard whose own comment records what it exists to prevent: the partner adds
// 37 guests on their phone, the host edits the venue on the laptop, and the
// cloud goes from 40 guests to 3. Unrecoverable — there is no undo for a row
// that was overwritten by a stale tab.
//
// So this stubs the Supabase query builder rather than the module that uses it,
// records the chain that was built, and asserts on the calls that actually
// decide whether a write is safe.

let chain;      // the calls made on the builder, in order
let response;   // what .select() finally resolves to

// A recording stand-in for supabase.from(...). Every method returns `this`, so
// the real code's fluent chain works unchanged and we get to read it back.
// It is THENABLE rather than having a terminal method, because the real chains
// end in different places — updateCloudEvent finishes on .select("version"),
// fetchCloudEvents carries on to .order() afterwards. A stub that resolves at a
// fixed point only works for whichever call site it was written against.
const builder = {
  from(t)      { chain.push(["from", t]);      return this; },
  update(row)  { chain.push(["update", row]);  return this; },
  insert(row)  { chain.push(["insert", row]);  return this; },
  delete()     { chain.push(["delete"]);       return this; },
  select(cols) { chain.push(["select", cols]); return this; },
  eq(col, val) { chain.push(["eq", col, val]); return this; },
  order(c, o)  { chain.push(["order", c, o]);  return this; },
  limit(n)     { chain.push(["limit", n]);     return this; },
  single()     { chain.push(["single"]);       return this; },
  then(res, rej) { return Promise.resolve(response).then(res, rej); },
};

vi.mock("../lib/supabase.js", () => ({
  supabase: { from: (t) => builder.from(t) },
  isSupabaseConfigured: true,
}));

const { updateCloudEvent, deleteCloudEvent, fetchCloudEvents, CLOUD_EVENTS_LIMIT, CloudConflictError } =
  await import("./cloudSync.js");

const eq = col => chain.find(c => c[0] === "eq" && c[1] === col);

const event = (over = {}) => ({
  id: "e1", cloudId: "cloud-1", name: "החתונה", type: "חתונה",
  guests: [], tables: [], seating: {}, constraints: [],
  version: 4, syncedVersion: 3, updatedAt: 1000, createdAt: 500, ...over,
});

beforeEach(() => { chain = []; response = { data: [{ version: 5 }], error: null }; });

describe("updateCloudEvent — the guard that stops a stale tab overwriting a newer one", () => {
  // Without this predicate the UPDATE matches the row whatever its version is:
  // a textbook lost update, and the 40-guests-to-3 loss the comment describes.
  it("constrains the write to the version this tab last synced", () => {
    return updateCloudEvent(event({ syncedVersion: 3 }), "user-1").then(() => {
      expect(eq("version")).toEqual(["eq", "version", 3]);
    });
  });

  // Zero rows updated means the row moved on between our read and our write.
  it("rejects with CloudConflictError when the row has moved on", async () => {
    response = { data: [], error: null };
    await expect(updateCloudEvent(event(), "user-1")).rejects.toBeInstanceOf(CloudConflictError);
    response = { data: null, error: null };
    await expect(updateCloudEvent(event(), "user-1")).rejects.toBeInstanceOf(CloudConflictError);
  });

  // An event that has never synced has no base to compare against, and a
  // conflict error there would strand it forever — it must write unconditionally.
  it("writes unconditionally, and never conflicts, when there is no synced base", async () => {
    response = { data: [], error: null };
    const out = await updateCloudEvent(event({ syncedVersion: undefined, version: 9 }), "user-1");
    expect(eq("version")).toBeUndefined();
    expect(out).toBe(9);
  });

  it("treats a non-finite syncedVersion as no base rather than as version NaN", async () => {
    for (const bad of [null, NaN, "3", undefined]) {
      chain = [];
      await updateCloudEvent(event({ syncedVersion: bad }), "user-1");
      expect(eq("version"), String(bad)).toBeUndefined();
    }
  });

  // Tenant scoping. RLS is the real boundary, but a client that omits this
  // sends a cross-tenant write and finds out from the server.
  it("scopes the write to this row AND this user", async () => {
    await updateCloudEvent(event(), "user-1");
    expect(eq("id")).toEqual(["eq", "id", "cloud-1"]);
    expect(eq("user_id")).toEqual(["eq", "user_id", "user-1"]);
  });

  // The returned version becomes the next push's base. Getting it wrong means
  // every later push compares against a version the server has moved past —
  // and then conflicts forever.
  it("returns the server's new version, so the next push has the right base", async () => {
    response = { data: [{ version: 12 }], error: null };
    await expect(updateCloudEvent(event(), "user-1")).resolves.toBe(12);
  });

  it("passes a transport error through rather than reporting a conflict", async () => {
    response = { data: null, error: new Error("network down") };
    await expect(updateCloudEvent(event(), "user-1")).rejects.not.toBeInstanceOf(CloudConflictError);
  });
});

describe("deleteCloudEvent", () => {
  it("filters on both the row id and the owner", async () => {
    response = { data: null, error: null };
    await deleteCloudEvent("cloud-9", "user-1");
    expect(chain.some(c => c[0] === "delete")).toBe(true);
    expect(eq("id")).toEqual(["eq", "id", "cloud-9"]);
    expect(eq("user_id")).toEqual(["eq", "user_id", "user-1"]);
  });
});

describe("fetchCloudEvents", () => {
  it("asks for this user's rows, newest first", async () => {
    response = { data: [], error: null };
    await fetchCloudEvents("user-1");
    expect(eq("user_id")).toEqual(["eq", "user_id", "user-1"]);
    const ord = chain.find(c => c[0] === "order");
    expect(ord[1]).toBe("updated_at");
    expect(ord[2]).toEqual({ ascending: false });
  });

  // The page size is not a detail here. mergeCloudWithLocal reads an event's
  // ABSENCE from this list as "deleted on another device", so where the list
  // stops decides what gets deleted. Without an explicit limit that decision
  // belonged to PostgREST's server-side default — a number this code does not
  // set, cannot see, and would silently delete past.
  it("bounds the page explicitly, so a caller can tell a full read from a cut-off one", async () => {
    response = { data: [], error: null };
    await fetchCloudEvents("user-1");
    const lim = chain.find(c => c[0] === "limit");
    expect(lim, "no explicit limit — an absence from this fetch cannot be trusted").toBeTruthy();
    expect(lim[1]).toBe(CLOUD_EVENTS_LIMIT);
    expect(CLOUD_EVENTS_LIMIT).toBeGreaterThan(0);
  });
});
