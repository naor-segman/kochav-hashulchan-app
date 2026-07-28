import { describe, it, expect, afterEach, vi } from "vitest";
import { uid } from "./uid.js";

// This module is in the eager bundle and every id in the product comes from it
// — guest ids, table ids, and the public tokens that make up the RSVP, gift and
// album links. Two of its three branches had never run in a test, including the
// one that exists so `vite --host` on a LAN IP does not white-screen the whole
// app: crypto.randomUUID is only defined in a secure context.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("uid", () => {
  it("returns a well-formed v4 uuid on a normal browser", () => {
    expect(uid()).toMatch(UUID_V4);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 2000 }, uid));
    expect(ids.size).toBe(2000);
  });

  // The insecure-context path: randomUUID is gone, getRandomValues remains.
  it("hand-builds a valid v4 uuid when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const id = uid();
    expect(id).toMatch(UUID_V4);
    expect(id[14]).toBe("4");                        // version nibble
    expect("89ab").toContain(id[19]);                // variant nibble
  });

  it("sets the version and variant bits even when the random bytes are all zero", () => {
    vi.stubGlobal("crypto", { getRandomValues: a => a.fill(0) });
    expect(uid()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("sets them correctly when the random bytes are all 0xff", () => {
    vi.stubGlobal("crypto", { getRandomValues: a => a.fill(0xff) });
    expect(uid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  // Last resort: no crypto at all. Not a uuid, and not meant to be — it only
  // has to be unique enough that ids do not collide, and non-empty so the app
  // keeps running.
  it("still returns a usable unique id with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    const a = uid(), b = uid();
    expect(a).toMatch(/^id-/);
    expect(a.length).toBeGreaterThan(8);
    expect(a).not.toBe(b);
  });

  it("survives a crypto object that exists but has neither method", () => {
    vi.stubGlobal("crypto", {});
    expect(uid()).toMatch(/^id-/);
  });

  // Ids are written into URLs and used as object keys, so anything that would
  // need escaping is a bug in every branch.
  it("never produces characters that would need escaping in a URL", () => {
    for (const stub of [undefined, {}, { getRandomValues: a => a.fill(7) }]) {
      vi.stubGlobal("crypto", stub);
      expect(uid()).toMatch(/^[A-Za-z0-9-]+$/);
    }
  });
});
