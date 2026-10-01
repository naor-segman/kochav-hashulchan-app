import { describe, it, expect, vi } from "vitest";
import { deadlineFor, timedFetch } from "./supabase.js";

/* סב50: no request had a deadline; a hung server left every guest page on
 * "טוען…" for as long as the guest waited. */
describe("request deadlines", () => {
  it("15 s for the database, 90 s for functions, none for file uploads", () => {
    expect(deadlineFor("https://x.supabase.co/rest/v1/rpc/public_event_by_token")).toBe(15_000);
    expect(deadlineFor("https://x.supabase.co/auth/v1/token?grant_type=refresh_token")).toBe(15_000);
    expect(deadlineFor("https://x.supabase.co/functions/v1/detect-floor-plan")).toBe(90_000);
    expect(deadlineFor("https://x.supabase.co/storage/v1/object/event-album/e/t/a.jpg")).toBeNull();
  });

  it("a big upload gets time in proportion; the host's event list gets 60 s", () => {
    const body = "x".repeat(622_000);                        // a 2,000-guest event
    expect(deadlineFor("https://x.supabase.co/rest/v1/events?id=eq.1", { body })).toBe(92_000);
    expect(deadlineFor("https://x.supabase.co/rest/v1/events?select=*")).toBe(60_000);
    expect(deadlineFor("https://x.supabase.co/rest/v1/events", { body: "x".repeat(5_000_000) })).toBe(120_000);
    expect(deadlineFor("https://x.supabase.co/rest/v1/rpc/submit_rsvp_by_token", { body: "{}" })).toBe(16_000);
  });

  it("a request that never answers is aborted at the deadline", async () => {
    vi.useFakeTimers();
    const hung = vi.fn((_u, init) => new Promise((_res, rej) => {
      init.signal.addEventListener("abort", () => rej(init.signal.reason));
    }));
    vi.stubGlobal("fetch", hung);
    const p = timedFetch("https://x.supabase.co/rest/v1/rpc/x", {});
    const settled = p.then(() => "resolved", () => "rejected");
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await settled).toBe("rejected");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
