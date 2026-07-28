import { describe, it, expect } from "vitest";
import { buildGuestCardUrl, readGuestCardParams, guestScanPayload } from "./guestCard.js";
import { parseScanPayload } from "./scanPayload.js";

const ORIGIN = "https://kochav.app";

describe("guestScanPayload ↔ parseScanPayload", () => {
  it("round-trips: what the card encodes is what the scanner reads", () => {
    expect(parseScanPayload(guestScanPayload("g-123"))).toBe("g-123");
  });
});

describe("buildGuestCardUrl", () => {
  it("builds a personal link carrying id, name and table", () => {
    const url = buildGuestCardUrl(ORIGIN, "tok", { id: "g1", name: "טל" }, { name: "7" });
    const u = new URL(url);
    expect(u.pathname).toBe("/card/tok");
    expect(u.searchParams.get("g")).toBe("g1");
    expect(u.searchParams.get("n")).toBe("טל");
    expect(u.searchParams.get("t")).toBe("7");
  });

  it("omits the table when the guest is not seated yet", () => {
    const url = buildGuestCardUrl(ORIGIN, "tok", { id: "g1", name: "טל" }, null);
    expect(new URL(url).searchParams.get("t")).toBeNull();
  });

  it("returns null without an invite token or a guest id", () => {
    expect(buildGuestCardUrl(ORIGIN, null, { id: "g1" }, null)).toBeNull();
    expect(buildGuestCardUrl(ORIGIN, "tok", {}, null)).toBeNull();
    expect(buildGuestCardUrl(ORIGIN, "tok", null, null)).toBeNull();
  });
});

describe("readGuestCardParams", () => {
  it("reads the params back out", () => {
    expect(readGuestCardParams("?g=g1&n=%D7%98%D7%9C&t=7"))
      .toEqual({ guestId: "g1", name: "טל", table: "7" });
  });

  it("returns null when there is no guest id — a plain invitation stays plain", () => {
    expect(readGuestCardParams("")).toBeNull();
    expect(readGuestCardParams("?n=טל")).toBeNull();
    expect(readGuestCardParams(undefined)).toBeNull();
  });

  it("caps lengths so a hand-edited link can't inject a wall of text", () => {
    const long = "x".repeat(500);
    const r = readGuestCardParams(`?g=g1&n=${long}&t=${long}`);
    expect(r.name).toHaveLength(60);
    expect(r.table).toHaveLength(40);
  });

  it("tolerates a missing name and table", () => {
    expect(readGuestCardParams("?g=g1")).toEqual({ guestId: "g1", name: "", table: "" });
  });
});
