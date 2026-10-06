import { describe, it, expect, vi } from "vitest";

// The sample invitation (136, owner 6.10) runs on the real guest pages with no
// database: the fetchers answer the sample token locally and writes go nowhere.
const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock("../lib/supabase.js", () => ({ supabase: { rpc }, isSupabaseConfigured: true }));

const { fetchEventByToken, submitRSVP, submitGift, fetchGiftWall } = await import("../utils/publicTokens.js");
const { SAMPLE_TOKEN, sampleEvent } = await import("./sampleEvent.js");

describe("the sample invitation", () => {
  it("is answered locally, with a published invitation and site, and never asks the server", async () => {
    const ev = await fetchEventByToken("invite", SAMPLE_TOKEN);
    expect(ev.name).toBe("החתונה של נועה וטל");
    expect(ev.site.enabled).toBe(true);
    expect(ev.announcements.invitation.enabled).toBe(true);
    expect(ev.rsvpToken).toBe(SAMPLE_TOKEN);
    await submitRSVP(SAMPLE_TOKEN, { status: "yes", name: "דנה", guestsCount: 2 });
    await submitGift(SAMPLE_TOKEN, { donorName: "דנה", amountILS: 300, message: "מזל טוב" });
    expect((await fetchGiftWall(SAMPLE_TOKEN)).length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("can never name a real event: real tokens are ≥8 characters", () => {
    expect(SAMPLE_TOKEN.length).toBeLessThan(8);
  });

  it("is always in the future, so its countdown is live", () => {
    const d = sampleEvent().date;
    const t = new Date(); const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    expect(d > today).toBe(true);
  });

  it("any other token still goes to the server", async () => {
    await fetchEventByToken("invite", "a-real-token-uuid");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
