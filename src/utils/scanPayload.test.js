import { describe, it, expect } from "vitest";
import { parseScanPayload } from "./scanPayload.js";

describe("parseScanPayload", () => {
  it("accepts a bare guest id", () => {
    expect(parseScanPayload("g-123")).toBe("g-123");
    expect(parseScanPayload("  g-123  ")).toBe("g-123");
  });

  it("accepts the kh1: prefixed form", () => {
    expect(parseScanPayload("kh1:g-123")).toBe("g-123");
  });

  it("pulls the guest id out of a personal link", () => {
    expect(parseScanPayload("https://kochav.app/card/abc?g=g-123")).toBe("g-123");
    expect(parseScanPayload("https://kochav.app/card/abc?x=1&g=g-9")).toBe("g-9");
  });

  it("refuses a link with no guest id, so scanning the generic event invite checks nobody in", () => {
    expect(parseScanPayload("https://kochav.app/rsvp/some-token")).toBeNull();
    expect(parseScanPayload("http://example.com")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseScanPayload("")).toBeNull();
    expect(parseScanPayload("   ")).toBeNull();
    expect(parseScanPayload(undefined)).toBeNull();
    expect(parseScanPayload(null)).toBeNull();
  });

  it("treats an empty kh1 payload as no id rather than an empty guest", () => {
    expect(parseScanPayload("kh1:")).toBeNull();
  });
});
