import { describe, it, expect, vi, beforeEach } from "vitest";

// scrubRoute is the only thing standing between a public token and a table the
// admin panel reads. A token in a URL is a credential: `/rsvp/8f3c…` is the key
// to somebody's entire guest list, and it must never be written into a crash
// report. The module had no tests at all.

const rpc = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  supabase: { rpc: (...a) => rpc(...a) },
  isSupabaseConfigured: true,
}));

const { scrubRoute, reportError } = await import("./errorReport.js");

// Every route shape the app actually mints a public link for.
const TOKEN_ROUTES = ["rsvp", "invite", "gift", "card", "album", "collab", "hostess",
                      "invitation", "save-the-date"];

describe("scrubRoute — a token must never reach the crash table", () => {
  it.each(TOKEN_ROUTES)("replaces the token on /%s/:token", (route) => {
    const secret = "8f3c9a1b2d4e6f70";
    const out = scrubRoute(`/${route}/${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toBe(`/${route}/:token`);
  });

  it("scrubs the token but keeps the screen, including what follows it", () => {
    expect(scrubRoute("/gift/8f3c9a1b2d4e6f70/wall")).toBe("/gift/:token/wall");
  });

  // Event ids are not credentials, but they are noise and identify a customer.
  it("replaces event ids so a route groups instead of fragmenting", () => {
    expect(scrubRoute("/events/3f2504e0-4f89-11d3-9a0c-0305e82c3301/seating"))
      .toBe("/events/:id/seating");
  });

  it("leaves an ordinary app route completely alone", () => {
    expect(scrubRoute("/app")).toBe("/app");
    expect(scrubRoute("/pricing")).toBe("/pricing");
    expect(scrubRoute("/")).toBe("/");
  });

  it("never throws on the shapes a real URL can take", () => {
    for (const bad of [null, undefined, "", "no-leading-slash", "//", "/rsvp/", "/rsvp"]) {
      expect(() => scrubRoute(bad), String(bad)).not.toThrow();
    }
  });

  // The guard keys on the PREVIOUS segment, so a token nested deeper still has
  // its route word in front of it and is still caught.
  it("catches a token that is not the first segment", () => {
    expect(scrubRoute("/x/y/rsvp/8f3c9a1b2d4e6f70")).toBe("/x/y/rsvp/:token");
  });
});

describe("reportError never becomes the thing that breaks the page", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });

  it("swallows a transport failure rather than throwing into the render", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    expect(() => reportError(new Error("boom"))).not.toThrow();
    rpc.mockImplementation(() => { throw new Error("sync throw"); });
    expect(() => reportError(new Error("boom2"))).not.toThrow();
  });

  it("survives being handed something that is not an Error", () => {
    for (const bad of [null, undefined, "string", 42, {}, []]) {
      expect(() => reportError(bad), String(bad)).not.toThrow();
    }
  });
});
