// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* 89 — two small lies in the list screens.
 *  1. The guest Excel export had no companion-names column: names the app
 *     kept and showed were missing from the "backup" the host downloaded.
 *  2. Table bulk-add: an empty or 0 capacity previewed "(1 מקומות)" for a batch
 *     the button then refused, and the count had no ceiling — 5000 typed,
 *     5000 tables added. */

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const sheets = [];
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (aoa) => { sheets.push(aoa); return {}; },
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: () => {},
}));
window.scrollTo = () => {};

const GuestManagerScreen = (await import("./GuestManagerScreen.jsx")).default;
const TableBuilderScreen = (await import("./TableBuilderScreen.jsx")).default;

beforeEach(() => { sheets.length = 0; });

describe("guest Excel export carries the companions (89)", () => {
  it("a column of companion names, filled for the family, empty for a single", async () => {
    const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה", guests: [
      { id: "g1", name: "דניאל ישראל", count: 4, companions: ["אודליה", "מיכאל", "אריאל"], side: "bride" },
      { id: "g2", name: "רון", count: 1, side: "groom" },
    ] });
    render(<GuestManagerScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /הורדה לאקסל/ })); });
    const [aoa] = sheets;
    const col = aoa[0].indexOf("שמות המלווים");
    expect(col).toBeGreaterThan(-1);
    const row = (name) => aoa.find(r => r[0] === name);
    expect(row("דניאל ישראל")[col]).toBe("אודליה, מיכאל, אריאל");
    expect(row("רון")[col]).toBe("");
    // The old columns kept their places.
    expect(aoa[0].slice(0, 8)).toEqual(["שם מלא", "טלפון", "צד", "קבוצה", "כמות", "מנה", "אישור הגעה", "הערות"]);
  });
});

describe("table bulk-add preview and ceiling (89)", () => {
  const setup = () => {
    const patchEvent = vi.fn();
    const showToast = vi.fn();
    const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה", tables: [] });
    render(<TableBuilderScreen activeEvent={ev} patchEvent={patchEvent} go={vi.fn()} showToast={showToast} />);
    // The capacity label holds an InfoTip, so it is found by position: the
    // batch form's two number inputs are capacity, then count.
    const [cap, cnt] = document.querySelectorAll('input[type="number"]');
    expect(cnt).toBe(screen.getByLabelText("כמות שולחנות"));
    const add = () => fireEvent.click(screen.getByRole("button", { name: /^\+ הוסיפו/ }));
    return { patchEvent, showToast, cap, cnt, add };
  };

  it.each(["", "0"])("capacity %j previews no table, says what is needed, and adds nothing", (v) => {
    const { patchEvent, showToast, cap, add } = setup();
    fireEvent.change(cap, { target: { value: v } });
    expect(document.body.textContent).not.toMatch(/1 מקומות|\(מקום אחד\)/);
    expect(screen.getByRole("status").textContent).toMatch(/בין 1 ל-100/);
    add();
    expect(patchEvent).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/מקומות/), "err");
  });

  it("5000 tables is refused, not created", () => {
    const { patchEvent, showToast, cnt, add } = setup();
    fireEvent.change(cnt, { target: { value: "5000" } });
    expect(screen.getByRole("status").textContent).toMatch(/בין 1 ל-200/);
    add();
    expect(patchEvent).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/200/), "err");
  });

  it("a valid batch still previews and adds", () => {
    const { patchEvent, cap, cnt, add } = setup();
    fireEvent.change(cap, { target: { value: "12" } });
    fireEvent.change(cnt, { target: { value: "3" } });
    expect(document.body.textContent).toMatch(/יתווספו 3 שולחנות: .*\(12 מקומות כ"א\)/);
    add();
    expect(patchEvent).toHaveBeenCalledTimes(1);
    const next = patchEvent.mock.calls[0][0]({ tables: [] });
    expect(next.tables.map(t => t.capacity)).toEqual([12, 12, 12]);
  });
});
