// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";
import PackagePicker from "./PackagePicker.jsx";
import { priceFor, formatShekel } from "../../data/pricingCurve.js";

/* The /pricing stepper must quote what the event's own card will quote for the
   same list (review 5.10): a typed number rounds UP to the step that covers it,
   above the top step there is a quote and no price, and the price follows the
   typing rather than waiting for blur. */
const at = (initial = 300) => render(<MemoryRouter><PackagePicker initial={initial} /></MemoryRouter>);
const box = () => screen.getByRole("spinbutton");
const amounts = () => [...document.querySelectorAll("article")].map(a => a.querySelector("p span")?.textContent);

describe("PackagePicker", () => {
  it("320 typed is the 350 step — the same price the event card shows", () => {
    at();
    fireEvent.change(box(), { target: { value: "320" } });
    expect(amounts()[0]).toBe(formatShekel(priceFor("auto", 350)));
    expect(document.body.textContent).toContain("עד 350 מוזמנים");
  });

  it("prices while typing, before the field is left", () => {
    at();
    fireEvent.change(box(), { target: { value: "870" } });
    expect(amounts()[0]).toBe(formatShekel(priceFor("auto", 900)));
  });

  it("above 1,000: no price and no buy button, a quote on WhatsApp", () => {
    at();
    fireEvent.change(box(), { target: { value: "5000" } });
    fireEvent.blur(box());
    expect(document.querySelectorAll("article").length).toBe(0);
    expect(screen.queryByText(/בחירת חבילה/)).toBeNull();
    const wa = screen.getByRole("link", { name: "הצעת מחיר בוואטסאפ" });
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("5000 מוזמנים");
    expect(box().value).toBe("5000");
  });

  it("+ at the top does not disable the focused button under the keyboard", () => {
    at(1000);
    const plus = screen.getByRole("button", { name: /הוספת/ });
    plus.focus();
    fireEvent.click(plus);
    expect(plus.disabled).toBe(false);
    expect(plus.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(plus);
    expect(box().value).toBe("1000");
  });

  it("a screen reader hears the number and the two prices, not both whole cards", () => {
    at(300);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live.textContent).toContain("עד 300 מוזמנים");
    expect(live.textContent.length).toBeLessThan(120);
    expect(document.querySelectorAll('[aria-live]').length).toBe(1);
  });
});
