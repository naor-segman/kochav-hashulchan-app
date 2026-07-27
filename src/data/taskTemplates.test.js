import { describe, it, expect, vi, afterEach } from "vitest";
import { starterTasks, seedTaskDue, TASK_STATUSES, TASK_PRIORITIES } from "./taskTemplates.js";

afterEach(() => vi.useRealTimers());

describe("starterTasks", () => {
  it("returns a wedding list by default and for unknown types", () => {
    expect(starterTasks("wedding").length).toBeGreaterThan(5);
    expect(starterTasks("nonsense")).toEqual(starterTasks("wedding"));
    expect(starterTasks(undefined)).toEqual(starterTasks("wedding"));
  });

  it("gives business events their own list, not the wedding one", () => {
    const biz = starterTasks("business");
    expect(biz).not.toEqual(starterTasks("wedding"));
    expect(biz.some(t => t.title.includes("תקציב"))).toBe(true);
  });

  it("shares one list across the mitzvah-style events", () => {
    expect(starterTasks("bar")).toEqual(starterTasks("bat"));
  });

  it("only uses known priorities and offsets that count down to the event", () => {
    const valid = new Set(TASK_PRIORITIES.map(p => p.value));
    for (const type of ["wedding", "bar", "business"]) {
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
