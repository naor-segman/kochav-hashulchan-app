import { describe, it, expect } from "vitest";
import {
  canCreateEvent, canAddGuest, canUseAdvancedExports, canUseAI, canUseCollaboration,
} from "./featureGates.js";

describe("canCreateEvent — event limits", () => {
  it("free allows exactly 1 event", () => {
    expect(canCreateEvent("free", 0).allowed).toBe(true);
    expect(canCreateEvent("free", 1).allowed).toBe(false);
    expect(canCreateEvent("free", 1).reason).toContain("1");
  });
  it("pro allows up to 20", () => {
    expect(canCreateEvent("pro", 19).allowed).toBe(true);
    expect(canCreateEvent("pro", 20).allowed).toBe(false);
  });
  it("enterprise is unlimited (no reason)", () => {
    expect(canCreateEvent("enterprise", 9999).allowed).toBe(true);
    expect(canCreateEvent("enterprise", 9999).reason).toBeNull();
  });
});

describe("canAddGuest — guest limits", () => {
  it("free allows up to 80 guests", () => {
    expect(canAddGuest("free", 79).allowed).toBe(true);
    expect(canAddGuest("free", 80).allowed).toBe(false);
  });
  it("enterprise is unlimited", () => {
    expect(canAddGuest("enterprise", 100000).allowed).toBe(true);
  });
});

describe("feature flags by plan", () => {
  it("advanced exports: pro+ only", () => {
    expect(canUseAdvancedExports("free").allowed).toBe(false);
    expect(canUseAdvancedExports("pro").allowed).toBe(true);
    expect(canUseAdvancedExports("enterprise").allowed).toBe(true);
  });
  it("AI + collaboration: enterprise only", () => {
    expect(canUseAI("pro").allowed).toBe(false);
    expect(canUseAI("enterprise").allowed).toBe(true);
    expect(canUseCollaboration("pro").allowed).toBe(false);
    expect(canUseCollaboration("enterprise").allowed).toBe(true);
  });
  it("unknown plan falls back to free limits", () => {
    expect(canCreateEvent("bogus", 1).allowed).toBe(false); // free = max 1
    expect(canUseAdvancedExports("bogus").allowed).toBe(false);
  });
});
