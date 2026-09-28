import { describe, it, expect, afterEach } from "vitest";
import { parseScanPayload, isScanSupported, isQrSupported } from "./scanPayload.js";

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

describe("scan support — the camera is the gate, not the native detector (WORKPLAN ד2/ק)", () => {
  const saved = { md: globalThis.navigator?.mediaDevices, bd: globalThis.window?.BarcodeDetector };
  const setCamera = (on) => Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: on ? { getUserMedia: () => Promise.resolve() } : undefined, configurable: true,
  });
  afterEach(() => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", { value: saved.md, configurable: true });
    if (globalThis.window) globalThis.window.BarcodeDetector = saved.bd;
  });

  it("an iPhone — camera, no BarcodeDetector — can scan (it could not)", async () => {
    setCamera(true);
    if (globalThis.window) delete globalThis.window.BarcodeDetector;
    expect(isScanSupported()).toBe(true);
    expect(await isQrSupported()).toBe(false);   // → the jsQR path
  });

  it("no camera API — no scan button", () => {
    setCamera(false);
    expect(isScanSupported()).toBe(false);
  });
});
