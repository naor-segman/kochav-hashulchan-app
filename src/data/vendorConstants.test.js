import { describe, it, expect } from "vitest";
import {
  parseAmount, vendorTotals, vendorStatus, vendorCategory, paymentStatus,
  VENDOR_CATEGORIES,
} from "./vendorConstants.js";

describe("parseAmount", () => {
  it("reads plain numbers and numeric strings", () => {
    expect(parseAmount(1200)).toBe(1200);
    expect(parseAmount("1200")).toBe(1200);
  });
  it("tolerates the way people actually type money", () => {
    expect(parseAmount("12,000")).toBe(12000);
    expect(parseAmount("₪12000")).toBe(12000);
    expect(parseAmount(" 1200 ₪ ")).toBe(1200);
  });
  it("treats empty and junk as zero rather than NaN", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount("בקרוב")).toBe(0);
    expect(parseAmount(NaN)).toBe(0);
  });
});

describe("vendorTotals", () => {
  const list = [
    { id: "1", status: "booked",   price: "20000", paid: "5000" },
    { id: "2", status: "quoted",   price: "8000",  paid: "" },
    { id: "3", status: "declined", price: "50000", paid: "0" },
  ];

  it("excludes declined vendors from the committed figure", () => {
    // 50,000 from the vendor we passed on must not appear anywhere.
    expect(vendorTotals(list).committed).toBe(28000);
  });

  it("sums what was actually paid and what is still due", () => {
    const t = vendorTotals(list);
    expect(t.paid).toBe(5000);
    expect(t.remaining).toBe(23000);
  });

  it("never reports a negative remaining when overpaid", () => {
    expect(vendorTotals([{ status: "booked", price: "100", paid: "300" }]).remaining).toBe(0);
  });

  it("counts booked vs still-open, ignoring declined for open", () => {
    const t = vendorTotals(list);
    expect(t.count).toBe(3);
    expect(t.booked).toBe(1);
    expect(t.open).toBe(1);
  });

  it("handles an empty or missing list", () => {
    expect(vendorTotals([])).toMatchObject({ count: 0, committed: 0, remaining: 0 });
    expect(vendorTotals(undefined)).toMatchObject({ count: 0, committed: 0 });
  });
});

describe("lookups fall back instead of throwing", () => {
  it("unknown status resolves to the first one", () => {
    expect(vendorStatus("nope").value).toBe("lead");
    expect(vendorStatus(undefined).value).toBe("lead");
  });
  it("unknown category resolves to 'other'", () => {
    expect(vendorCategory("nope").value).toBe("other");
  });
  it("unknown payment state resolves to 'none'", () => {
    expect(paymentStatus("nope").value).toBe("none");
  });
  it("vendor categories reuse the budget ids so spend lines up", () => {
    const ids = VENDOR_CATEGORIES.map(c => c.value);
    for (const shared of ["venue", "catering", "music", "photographer", "flowers", "invitations", "other"]) {
      expect(ids).toContain(shared);
    }
  });
});
