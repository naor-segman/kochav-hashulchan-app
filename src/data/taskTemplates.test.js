import { describe, it, expect, vi, afterEach } from "vitest";
import { starterTasks, seedTaskDue, TASK_STATUSES, TASK_PRIORITIES } from "./taskTemplates.js";

afterEach(() => vi.useRealTimers());

describe("starterTasks", () => {
  // Types are the Hebrew strings from constants.js EVENT_TYPES — what
  // normalizeEvent actually stores. English keys fell through to the wedding
  // list, which is how a bar mitzvah board opened with "לבחור שמלה וחליפה".
  it("returns a wedding list for a wedding", () => {
    expect(starterTasks("חתונה").length).toBeGreaterThan(5);
    expect(starterTasks("חתונה").some(t => t.title.includes("שמלה"))).toBe(true);
  });

  it("falls back to the generic social list, never the wedding one", () => {
    const generic = starterTasks("אחר");
    expect(starterTasks("nonsense")).toEqual(generic);
    expect(starterTasks(undefined)).toEqual(generic);
    expect(generic).not.toEqual(starterTasks("חתונה"));
  });

  it("gives business events their own list, not the wedding one", () => {
    const biz = starterTasks("אירוע עסקי");
    expect(biz).not.toEqual(starterTasks("חתונה"));
    expect(biz.some(t => t.title.includes("תקציב"))).toBe(true);
  });

  it("shares one list across the mitzvah-style events", () => {
    expect(starterTasks("בר מצווה")).toEqual(starterTasks("בת מצווה"));
    expect(starterTasks("בר מצווה")).not.toEqual(starterTasks("חתונה"));
  });

  it("only uses known priorities and offsets that count down to the event", () => {
    const valid = new Set(TASK_PRIORITIES.map(p => p.value));
    for (const type of ["חתונה", "בר מצווה", "אירוע עסקי", "יום הולדת"]) {
      for (const t of starterTasks(type)) {
        expect(valid.has(t.priority)).toBe(true);
        expect(t.offset).toBeGreaterThan(0);
        expect(t.title.trim()).not.toBe("");
      }
    }
  });
});

describe("seedTaskDue", () => {
  it("dates a task the given number of days before the event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));
    expect(seedTaskDue("2026-06-10", 10)).toBe("2026-05-31");
  });

  it("leaves the due date empty when it would already be in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));
    // 180 days before a June event lands in the previous year — no point
    // opening the board with a pile of overdue rows.
    expect(seedTaskDue("2026-06-10", 180)).toBe("");
  });

  it("returns empty for a missing or malformed event date", () => {
    expect(seedTaskDue("", 10)).toBe("");
    expect(seedTaskDue(undefined, 10)).toBe("");
    expect(seedTaskDue("not-a-date", 10)).toBe("");
  });
});

describe("TASK_STATUSES", () => {
  it("covers exactly the three board columns", () => {
    expect(TASK_STATUSES.map(s => s.value)).toEqual(["todo", "doing", "done"]);
  });
});

describe("seedTaskDue across a DST boundary", () => {
  it("lands on the calendar day, not one short", () => {
    // days * 86400000 crosses an Israeli DST transition an hour short, which
    // seeded 6 of the 15 wedding tasks a day early for a summer event.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));
    const iso = (y, m, d) => {
      const dt = new Date(y, m - 1, d);
      const p = n => String(n).padStart(2, "0");
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    };
    // 2027-06-15 minus 180 days spans the spring transition.
    expect(seedTaskDue("2027-06-15", 180)).toBe(iso(2026, 12, 17));
    expect(seedTaskDue("2027-06-15", 90)).toBe(iso(2027, 3, 17));
  });
});
