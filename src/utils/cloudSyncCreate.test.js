import { describe, it, expect, vi, beforeEach } from "vitest";

/* 33c: a create whose response was lost. The row landed; the retry carries the
 * same tokens and fails on the unique indexes with 23505 — on every retry,
 * forever, so the event never got a cloudId and never synced again. The
 * recording builder of cloudSyncWrite.test.js, with one response per query. */
let chain, responses;
const builder = {
  from(t)      { chain.push(["from", t]);      return this; },
  insert(row)  { chain.push(["insert", row]);  return this; },
  select(cols) { chain.push(["select", cols]); return this; },
  eq(col, val) { chain.push(["eq", col, val]); return this; },
  single()     { chain.push(["single"]);       return this; },
  maybeSingle() { chain.push(["maybeSingle"]); return this; },
  then(res, rej) { return Promise.resolve(responses.shift()).then(res, rej); },
};
vi.mock("../lib/supabase.js", () => ({ supabase: { from: (t) => builder.from(t) }, isSupabaseConfigured: true }));
const { createCloudEvent } = await import("./cloudSync.js");

const event = { id: "e1", name: "החתונה", type: "חתונה", guests: [{ id: "g1", name: "דנה" }], tables: [], seating: {}, version: 3, updatedAt: 1000, createdAt: 500 };
const cloudRow = { id: "cloud-1", user_id: "user-1", name: "החתונה", type: "חתונה", version: 4,
  created_at: new Date(500).toISOString(), updated_at: new Date(900).toISOString(),
  payload: { localId: "e1", guests: [{ id: "g1", name: "דנה" }], updatedAt: 900, version: 4 } };

beforeEach(() => { chain = []; });

describe("createCloudEvent — the create that already landed (33c)", () => {
  it("on 23505 adopts this account's row with the same local id", async () => {
    responses = [{ data: null, error: { code: "23505", message: "duplicate key" } }, { data: cloudRow, error: null }];
    const out = await createCloudEvent(event, "user-1");
    expect(out.cloudId).toBe("cloud-1");
    expect(out.version).toBe(4);
    expect(out.adopted.id).toBe("e1");
    expect(out.adopted.cloudId).toBe("cloud-1");
    // looked up by THIS user and THIS event's local id — never another tenant's row
    expect(chain).toContainEqual(["eq", "user_id", "user-1"]);
    expect(chain).toContainEqual(["eq", "payload->>localId", "e1"]);
  });

  it("23505 with no such row is still an error", async () => {
    responses = [{ data: null, error: { code: "23505" } }, { data: null, error: null }];
    await expect(createCloudEvent(event, "user-1")).rejects.toMatchObject({ code: "23505" });
  });

  it("any other error is not looked up", async () => {
    responses = [{ data: null, error: { code: "42501" } }];
    await expect(createCloudEvent(event, "user-1")).rejects.toMatchObject({ code: "42501" });
    expect(chain.some(c => c[0] === "maybeSingle")).toBe(false);
  });
});
