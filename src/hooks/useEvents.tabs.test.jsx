// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: false, supabase: null }));
const { useEvents, mergeOtherTab } = await import("./useEvents.js");

/* 33a: two open tabs each persisted their WHOLE list, so the second tab to
 * save erased what the first had created — gone on the next reload. The
 * browser tells a tab when another writes its key ("storage" event); jsdom,
 * like a browser, does not fire it in the tab that wrote, so the test plays
 * the browser's part and announces each write. */
const KEY = "kochav_hashulchan_v1";
const announce = () => act(async () => {
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: localStorage.getItem(KEY), storageArea: localStorage }));
});

describe("two tabs (33a)", () => {
  it("an event created in each tab survives, in both tabs and after a reload", async () => {
    localStorage.clear();
    const tabA = renderHook(() => useEvents(null));
    const tabB = renderHook(() => useEvents(null));
    await act(async () => { tabA.result.current.addEvent({ id: "X", name: "החתונה (טאב A)" }); });
    await announce();
    await act(async () => { tabB.result.current.addEvent({ id: "Y", name: "בר מצווה (טאב B)" }); });
    await announce();

    const stored = JSON.parse(localStorage.getItem(KEY)).events.map(e => e.id).sort();
    expect(stored).toEqual(["X", "Y"]);
    expect(tabA.result.current.events.map(e => e.id).sort()).toEqual(["X", "Y"]);
    const reload = renderHook(() => useEvents(null));
    expect(reload.result.current.events.map(e => e.id).sort()).toEqual(["X", "Y"]);
  });

  it("an edit made in the other tab replaces the older copy here", async () => {
    localStorage.clear();
    const tabA = renderHook(() => useEvents(null));
    const tabB = renderHook(() => useEvents(null));
    await act(async () => { tabA.result.current.addEvent({ id: "X", name: "א" }); });
    await announce();
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    await act(async () => { tabB.result.current.patchEventById("X", { venue: "אולם חדש" }); });
    await announce();
    expect(tabA.result.current.events.find(e => e.id === "X").venue).toBe("אולם חדש");
  });
});

describe("mergeOtherTab", () => {
  const e = (id, updatedAt, extra = {}) => ({ id, name: id, updatedAt, ...extra });
  it("returns the same list when nothing is new — no ping-pong between tabs", () => {
    const mine = [e("X", 5)];
    expect(mergeOtherTab(mine, [e("X", 5)])).toBe(mine);
    expect(mergeOtherTab(mine, [e("X", 3)])).toBe(mine);
  });
  it("a logged-out tab does not take in another tab's cloud events", () => {
    expect(mergeOtherTab([], [e("X", 5, { cloudId: "c" })], false)).toEqual([]);
  });
  it("keeps this tab's floor-plan image when the newer copy had to leave it out", () => {
    const fp = (image) => ({ image, tablePositions: {}, elements: [] });
    const out = mergeOtherTab([e("X", 1, { floorPlan: fp("data:x") })], [e("X", 2, { floorPlan: fp(null) })]);
    expect(out[0].floorPlan.image).toBe("data:x");
  });
});
