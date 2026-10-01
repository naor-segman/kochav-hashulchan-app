// @vitest-environment jsdom
/* T5: the guest pages counted days from the DEVICE's date. A guest in New York
 * at 21:00 on the eve of the wedding is already on the wedding day in Israel,
 * and the save-the-date still said "1 יום לאירוע". The event's date is Israel's.
 *
 * The device here is New York on purpose — every date bug in this project is
 * invisible on a machine that is already in Israel. */
process.env.TZ = "America/New_York";

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, act } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import { daysUntil, daysUntilIsrael, israelToday, fmtDateTime } from "../utils/dateFormat.js";

const { default: AnnouncementScreen } = await import("./AnnouncementScreen.jsx");
const { default: EventHubScreen } = await import("./EventHubScreen.jsx");

// 01:00Z on 15.10.2026 = 21:00 on the 14th in New York = 04:00 on the 15th in Israel.
const NOW = new Date("2026-10-15T01:00:00Z");

beforeAll(() => {
  expect(new Date("2026-10-15T01:00:00Z").getDate(), "runner is not west of Greenwich — this file proves nothing").toBe(14);
});
afterEach(() => vi.useRealTimers());

describe("daysUntilIsrael", () => {
  it("counts from Israel's date, not the device's", () => {
    expect(daysUntil("2026-10-15", NOW)).toBe(1);           // the device's answer
    expect(daysUntilIsrael("2026-10-15", NOW)).toBe(0);     // the event's
    expect(daysUntilIsrael("2026-10-16", NOW)).toBe(1);
  });
  it("israelToday carries Israel's calendar date", () => {
    const d = israelToday(NOW);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 15]);
  });
  it("crosses the October fall-back by calendar days", () => {
    expect(daysUntilIsrael("2026-10-26", new Date("2026-10-24T09:00:00Z"))).toBe(2);
  });
});

describe("the save-the-date countdown, opened abroad on the eve", () => {
  it("does not say '1 יום לאירוע' when it is already the day in Israel", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    render(<MemoryRouter><AnnouncementScreen kind="saveTheDate" localEvent={{
      name: "החתונה", date: "2026-10-15", type: "חתונה", brideName: "דנה", groomName: "יוסי", tokens: {},
    }} /></MemoryRouter>);
    await screen.findByText(/החתונה|דנה/);
    expect(document.body.textContent).not.toMatch(/לאירוע/);
  });
});

describe("the hub countdown ticks", () => {
  it("re-reads the date when midnight passes with the hub open", async () => {
    // 23:59:30 local on the 14th; the event is on the 15th.
    vi.useFakeTimers({ now: new Date(2026, 9, 14, 23, 59, 30) });
    render(<AuthProvider><MemoryRouter><EventHubScreen activeEvent={{ id: "e1", name: "החתונה", type: "חתונה", date: "2026-10-15", guests: [], tables: [] }}
      patchEvent={() => {}} go={() => {}} showToast={() => {}} /></MemoryRouter></AuthProvider>);
    expect(screen.getByText("יום לאירוע")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(screen.getByText("האירוע היום")).toBeTruthy();
  });
});

describe("fmtDateTime with a year, for exports", () => {
  it("prints the year only when asked", () => {
    const iso = "2027-01-03T10:00:00Z";
    expect(fmtDateTime(iso)).not.toMatch(/2027/);
    expect(fmtDateTime(iso, { year: true })).toMatch(/2027/);
  });
});
