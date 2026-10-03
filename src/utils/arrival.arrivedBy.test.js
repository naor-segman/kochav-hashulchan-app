import { describe, it, expect } from "vitest";
import { withArrivedSeats, setRowArrived, toggleSeat, setArrivedCount, mergeArrivals, HOST_ARRIVED_BY } from "./arrival.js";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "./cloudSync.js";
import { normalizeEvent, duplicateEvent } from "./eventHelpers.js";

/* ו2: who marked an arrival. The host's screen now writes "מארח" on the row;
 * it rides in payload.guests both ways like arrivedAt. */
const g = { id: "g1", name: "רון", count: 2 };

describe("arrivedBy (ו2)", () => {
  it("the host's writers stamp the host", () => {
    expect(withArrivedSeats(g, [0]).arrivedBy).toBe(HOST_ARRIVED_BY);
    expect(setRowArrived(g, true).arrivedBy).toBe("מארח");
    expect(toggleSeat(g, 1).arrivedBy).toBe("מארח");
    expect(setArrivedCount(g, 2).arrivedBy).toBe("מארח");
  });

  it("another writer can name itself; an unknown one leaves no stale name", () => {
    expect(setRowArrived(g, true, "דיילת").arrivedBy).toBe("דיילת");
    const marked = withArrivedSeats(g, [0]);
    expect("arrivedBy" in withArrivedSeats(marked, [0, 1], 1, null)).toBe(false);
  });

  it("the merge carries the name of whoever wrote last", () => {
    const local = [{ ...g, arrivedSeats: [0], arrived: true, arrivedAt: 10, arrivedBy: "מארח" }];
    const cloud = [{ ...g, arrivedSeats: [0, 1], arrived: true, arrivedAt: 20 }];   // the greeter's RPC: no name
    const m = mergeArrivals(local, cloud)[0];
    expect(m.arrivedSeats).toEqual([0, 1]);
    expect("arrivedBy" in m).toBe(false);
    const back = mergeArrivals(cloud, local)[0];
    expect(back.arrivedSeats).toEqual([0, 1]);   // the newer cloud row wins
  });

  it("survives the cloud round-trip and normalizeEvent (bug class 3)", () => {
    const ev = normalizeEvent({ id: "e1", name: "x", guests: [withArrivedSeats(g, [1], 5)] });
    const row = { ...mapLocalEventToCloudPayload(ev, "u1"), id: "c1", created_at: new Date(0).toISOString() };
    const back = normalizeEvent(mapCloudEventToLocalEvent(JSON.parse(JSON.stringify(row))));
    expect(back.guests[0].arrivedBy).toBe("מארח");
    expect(back.guests[0].arrivedSeats).toEqual([1]);
  });

  it("is not copied by duplicateEvent, with the rest of the day-of state", () => {
    const ev = normalizeEvent({ id: "e1", name: "x", guests: [withArrivedSeats(g, [1], 5)] });
    expect("arrivedBy" in duplicateEvent(ev).guests[0]).toBe(false);
  });
});
