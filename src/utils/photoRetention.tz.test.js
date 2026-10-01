import { describe, it, expect } from "vitest";

/* סב45 (third review, 30.9). Run in NEW YORK on purpose: the server decides
 * deletion by Israel's date, and the banner used the device's. At 00:30 in
 * Israel on the deletion day (21:30 the evening before in New York) the host
 * was told "tomorrow" while the server was deleting. */
process.env.TZ = "America/New_York";
const { photoRetentionState, startOfToday, postponeToYmd } = await import("./photoRetention.js");

const ev = (date, site = {}) => ({ date, eventSite: { coverPhoto: "https://x/c.webp", ...site } });
const at = iso => new Date(iso);

describe("retention in Israel's calendar, wherever the device is", () => {
  it("the premise: this process is not in Israel", () => {
    expect(new Date("2026-09-30T21:30:00Z").getDate()).toBe(30);   // still the 30th in New York
  });
  it("today is Israel's date", () => {
    expect(startOfToday(at("2026-09-30T21:30:00Z")).getDate()).toBe(1);   // 00:30 on 1 Oct in Israel
  });
  it("on Israel's deletion day the state is due, not 'tomorrow'", () => {
    // event 1 Sep + 30 days = 1 Oct, the server's deletion day
    expect(photoRetentionState(ev("2026-09-01"), at("2026-09-30T21:30:00Z")).state).toBe("due");
  });
  it("a postponement warns a week ahead, like the first date did", () => {
    const r = photoRetentionState(ev("2026-09-01", { photosKeepUntil: "2026-11-24" }), at("2026-11-20T09:00:00Z"));
    expect(r.state).toBe("warning");
    expect(r.daysLeft).toBe(4);
    expect(photoRetentionState(ev("2026-09-01", { photosKeepUntil: "2026-11-24" }), at("2026-11-01T09:00:00Z")).state).toBe("kept");
  });
  it("postponing from New York counts from Israel's today", () => {
    expect(postponeToYmd(at("2026-09-30T21:30:00Z"))).toBe("2026-10-31");
  });
});
