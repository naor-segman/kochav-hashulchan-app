import { describe, it, expect } from "vitest";
import { reachable, whatsappLink, renderTemplate } from "./messageSequence.js";

// Three edits to messageSequence.js passed the whole suite in the third-review
// mutation run (29.9). Each changes who gets a message or what it says.

describe("a phone Excel stripped the zero from is still reachable", () => {
  // Excel reads 0501234567 as a number and stores 501234567 — nine digits. It
  // is the most common shape a pasted guest list arrives in, and whatsappLink
  // already knows what to do with it (972 + the nine digits). If `reachable`
  // demanded ten, every such guest silently fell out of the send list — the
  // host sends to "everyone" and the relatives from that spreadsheet never get
  // the invitation.
  it("501234567 is reachable and gets a working link", () => {
    expect(reachable([{ phone: "501234567" }])).toHaveLength(1);
    expect(whatsappLink("501234567", "x")).toBe("https://wa.me/972501234567?text=x");
  });
});

describe("whatsappLink: too few digits is no link at all", () => {
  // Eight digits is not a number anywhere this product sends to — it is a
  // typo, or a number with two digits lost. The alternative to null is
  // wa.me/12345678, which opens WhatsApp on a number that does not exist.
  // `reachable` draws the same line at nine, and the two must agree.
  it("8 digits → null; 9 digits → a link", () => {
    expect(whatsappLink("12345678", "x")).toBeNull();
    expect(reachable([{ phone: "12345678" }])).toHaveLength(0);
    expect(whatsappLink("501234567", "x")).not.toBeNull();
  });
});

describe("{{אירוע}} with no event name reads as a sentence", () => {
  // Only the event NAME is required in setup, but a template can be rendered
  // before it is typed (the preview) or for an event whose name was cleared.
  // The fallback is "האירוע", and the prefix rule turns "ל{{אירוע}}" into
  // "לאירוע". Without a fallback the guest reads "אתם מוזמנים ל" and nothing.
  it("event without a name → 'לאירוע'", () => {
    expect(renderTemplate("אתם מוזמנים ל{{אירוע}}", { event: {} })).toBe("אתם מוזמנים לאירוע");
    expect(renderTemplate("{{אירוע}}", { event: { name: "" } })).toBe("האירוע");
  });
});
