// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../../test/dom.js";

/* The cookie question (owner 3.10, from the idigital example the owner sent:
 * equal "מאשר" / "מסרב", "ניהול העדפות", and a second layer of categories).
 * What the law reading of 3.10 asked for, each pinned:
 *   • the two answers are the SAME control — same skin, same size;
 *   • nothing pre-ticked; no answer = no measurement;
 *   • reopenable from anywhere, as easy as answering;
 *   • never on a guest page — measurement does not run there. */

const applyConsent = vi.fn();
let configured = true;
vi.mock("../../lib/analytics.js", () => ({
  get analyticsConfigured() { return configured; },
  applyConsent: (...a) => applyConsent(...a),
}));

const { default: ConsentBanner } = await import("./ConsentBanner.jsx");
const { openConsentSettings, readConsent } = await import("../../utils/consent.js");

const at = (path) => render(<MemoryRouter initialEntries={[path]}><ConsentBanner /></MemoryRouter>);
const banner = () => screen.queryByRole("region", { name: "הסכמה לשימוש בעוגיות" });

beforeEach(() => { localStorage.clear(); applyConsent.mockClear(); configured = true; });

describe("the first layer", () => {
  it("asks on a first visit, with two answers that look exactly alike", () => {
    at("/app");
    expect(banner()).toBeInTheDocument();
    const yes = screen.getByRole("button", { name: "אישור" });
    const no = screen.getByRole("button", { name: "סירוב" });
    expect(yes.className, "a loud yes beside a quiet no is the dark pattern").toBe(no.className);
    expect(screen.getByRole("button", { name: "ניהול העדפות" })).toBeInTheDocument();
    expect(applyConsent, "no answer = nothing started").not.toHaveBeenCalled();
  });

  it("אישור: saved, measurement started, the question goes away", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "אישור" }));
    expect(readConsent()).toMatchObject({ analytics: true });
    expect(applyConsent).toHaveBeenCalledWith(true);
    expect(banner()).toBeNull();
  });

  it("סירוב: saved as a no, and not asked again", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "סירוב" }));
    expect(readConsent()).toMatchObject({ analytics: false });
    expect(applyConsent).toHaveBeenCalledWith(false);
    expect(banner()).toBeNull();
  });

  it("already answered on an earlier visit: not asked", () => {
    localStorage.setItem("kochav_consent_v1", JSON.stringify({ analytics: false, at: "2026-10-03T00:00:00.000Z" }));
    at("/home");
    expect(banner()).toBeNull();
  });

  it("never on a guest page — an RSVP guest is not measured, so not asked", () => {
    for (const p of ["/rsvp/abc123", "/gift/abc123", "/album/abc123", "/invite/abc123", "/collab/abc123"]) {
      const { unmount } = at(p);
      expect(banner(), p).toBeNull();
      unmount();
    }
  });

  it("no PostHog key: nothing optional on the site, nothing to ask", () => {
    configured = false;
    at("/app");
    expect(banner()).toBeNull();
    act(() => openConsentSettings());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the preferences", () => {
  it("measurement is NOT ticked in advance; essential is on and locked", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "ניהול העדפות" }));
    const dialog = screen.getByRole("dialog", { name: "העדפות עוגיות ופרטיות" });
    const [essential, measure] = dialog.querySelectorAll('input[type="checkbox"]');
    expect(essential.checked && essential.disabled).toBe(true);
    expect(measure.checked, "a pre-ticked box is not consent").toBe(false);
    expect(measure.disabled).toBe(false);
  });

  it("שמירת הבחירה saves what is ticked", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "ניהול העדפות" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "מדידת שימוש" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירת הבחירה" }));
    expect(readConsent()).toMatchObject({ analytics: true });
    expect(applyConsent).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(banner()).toBeNull();
  });

  it("אישור הכל / דחיית הכל are the same control too", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "ניהול העדפות" }));
    expect(screen.getByRole("button", { name: "אישור הכל" }).className)
      .toBe(screen.getByRole("button", { name: "דחיית הכל" }).className);
    fireEvent.click(screen.getByRole("button", { name: "דחיית הכל" }));
    expect(readConsent()).toMatchObject({ analytics: false });
  });

  it("Escape closes without deciding — the question is still there", () => {
    at("/app");
    fireEvent.click(screen.getByRole("button", { name: "ניהול העדפות" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readConsent()).toBeNull();
    expect(banner()).toBeInTheDocument();
  });

  it("reopened later from the footer / privacy / account, showing the answer given", () => {
    localStorage.setItem("kochav_consent_v1", JSON.stringify({ analytics: true, at: "2026-10-03T00:00:00.000Z" }));
    at("/privacy");
    act(() => openConsentSettings());
    expect(screen.getByRole("checkbox", { name: "מדידת שימוש" }).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "דחיית הכל" }));
    expect(readConsent()).toMatchObject({ analytics: false });
    expect(applyConsent).toHaveBeenCalledWith(false);
  });
});
