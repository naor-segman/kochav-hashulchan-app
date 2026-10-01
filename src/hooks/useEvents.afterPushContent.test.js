import { describe, it, expect } from "vitest";
import { afterPush } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import { isCloudBacked } from "../utils/storage.js";

/* 71a (residual): the push acknowledgement marked the event "in step" when its
 * version, updatedAt and edit count matched what was sent — all three of which
 * a merge that ran while the push was on the wire can put back. The device then
 * showed "synced", and the sign-out prune trusted it, while it held a value the
 * cloud did not (fuzz: costs). The content is compared too now. */
const T = 1_790_000_000_000;
const sent = normalizeEvent({ id: "e1", cloudId: "c1", name: "x", costs: { categories: [{ id: "c", name: "B", amount: 1 }] },
  guests: [{ id: "g1", name: "רון" }], version: 8, syncedVersion: 7, updatedAt: T, localEdits: 4 });

describe("afterPush compares what is held with what was sent (71a)", () => {
  it("same counters, different content → still owed to the cloud", () => {
    const held = { ...sent, costs: { categories: [{ id: "c", name: "C", amount: 1 }] } };
    const out = afterPush(held, sent.version, 8, syncBaseOf(sent), sent.updatedAt, sent.localEdits);
    expect(out.syncedVersion).toBe(8);
    expect(out.version).toBe(9);
    expect(isCloudBacked(out)).toBe(false);
  });

  it("a guest field held but not sent → still owed", () => {
    const held = { ...sent, guests: [{ ...sent.guests[0], notes: "צמחוני" }] };
    const out = afterPush(held, sent.version, 8, syncBaseOf(sent), sent.updatedAt, sent.localEdits);
    expect(isCloudBacked(out)).toBe(false);
  });

  it("exactly what was sent → in step", () => {
    const out = afterPush(sent, sent.version, 8, syncBaseOf(sent), sent.updatedAt, sent.localEdits);
    expect(out.version).toBe(8);
    expect(isCloudBacked(out)).toBe(true);
  });
});
