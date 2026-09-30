// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* Fifth review 30.9, the shared family table, measured in a browser:
 *  - "דנה " + a pause + "כהן" was stored "דנהכהן": the server trims, and the
 *    3 s poll wrote its trimmed copy into the field mid-word;
 *  - with a slow save, letters typed while it was on the wire were lost for
 *    good: the older save released the row and the poll overwrote the field. */

const server = new Map();
let saveDelay = 0;
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabEvent: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchCollabGuests: async () => [...server.values()].map(r => ({ ...r })),
  deleteCollabGuest: async () => {},
  upsertCollabGuest: (_t, row) => new Promise(res => setTimeout(() => {
    server.set(row.id, { ...row, name: row.name.trim(), phone: (row.phone || "").trim() });   // the RPC trims
    res();
  }, saveDelay)),
}));
const { default: CollabScreen } = await import("./CollabScreen.jsx");
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  server.clear();
  server.set("r1", { id: "r1", name: "משפחת", phone: "", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [] });
});
afterEach(() => vi.useRealTimers());

const open = async () => {
  render(<MemoryRouter initialEntries={["/collab/tok12345"]}><Routes>
    <Route path="/collab/:token" element={<CollabScreen />} />
  </Routes></MemoryRouter>);
  await tick(0); await tick(0);
  return screen.getByDisplayValue("משפחת");
};
const typeOn = (input, ch) => fireEvent.change(input, { target: { value: input.value + ch } });

describe("typing into the shared table", () => {
  it("a pause after a space does not glue the next word", async () => {
    saveDelay = 0;
    const input = await open();
    typeOn(input, " ");
    await tick(4000);                   // saved (trimmed) and polled back
    for (const ch of "כהן") { typeOn(input, ch); await tick(100); }
    await tick(8000);
    expect(input.value).toBe("משפחת כהן");
    expect(server.get("r1").name).toBe("משפחת כהן");
  });

  it("a slow save does not lose the letters typed while it was on the wire", async () => {
    saveDelay = 2500;
    const input = await open();
    const word = " אבגדהוזחטיכ";
    for (const ch of word) { typeOn(input, ch); await tick(700); }
    await tick(12000);
    expect(input.value).toBe("משפחת" + word);
    expect(server.get("r1").name).toBe(("משפחת" + word).trim());
  });
});
