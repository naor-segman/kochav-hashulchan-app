// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import HelpScreen from "./HelpScreen.jsx";
import { AREAS } from "../data/eventAreas.js";

/* Copy that told the host something untrue (סב60c). Each of these was a
 * sentence about the product that the product contradicts. */

describe("HelpScreen names screens that exist (סב60c, 37g)", () => {
  const answers = () => {
    render(<MemoryRouter><HelpScreen /></MemoryRouter>);
    const out = [];
    const qs = screen.getAllByRole("button", { expanded: false }).concat(screen.getAllByRole("button", { expanded: true }));
    for (const q of qs) {
      if (q.getAttribute("aria-expanded") !== "true") fireEvent.click(q);
      const a = q.parentElement.querySelector("p");
      if (a) out.push(a.textContent);
    }
    return out;
  };

  it("every \"במסך/בטאב X\" in an answer is the label of a real screen", () => {
    const labels = new Set(AREAS.flatMap(a => a.items.flatMap(i => [i.label, i.short].filter(Boolean))));
    const named = answers().flatMap(a => [...a.matchAll(/(?:במסך|בטאב) "([^"]+)"/g)].map(m => m[1]));
    expect(named.length).toBeGreaterThan(4);
    expect(named.filter(n => !labels.has(n))).toEqual([]);
  });

  it("the RSVP answer points at קישורים לאורחים, and does not promise a button to press", () => {
    const rsvp = answers().find(a => a.includes("לאישור הגעה"));
    expect(rsvp).toContain("קישורים לאורחים");
    expect(rsvp).toContain("אישורי הגעה");
    expect(rsvp).not.toMatch(/תחת "שיתוף"|בלחיצה/);
  });
});

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("claims the product contradicts (סב60c)", () => {
  it("the event-day page no longer says scanning does not work on an iPhone", () => {
    const s = src("./services/EventDayServiceScreen.jsx");
    expect(s).not.toMatch(/לא באייפון|ולא בספארי/);
    expect(s).toMatch(/גם באייפון/);
  });

  it("the site editor does not say the site is sent to the guests by itself", () => {
    expect(src("./EventSiteEditorScreen.jsx")).not.toMatch(/ונשלח לאורחים/);
  });

  it("the auth callback speaks in the plural", () => {
    const s = src("./AuthCallbackScreen.jsx");
    expect(s).not.toMatch(/נסה להתחבר|היכנס לחשבון|"[^"]*מעביר…"/);
    // Since 131 (3.10) the spent-link line is "פשוט היכנסו לחשבון" — still plural.
    expect(s).toMatch(/נסו להתחבר|היכנסו לחשבון/);
  });

  it("the enterprise card never writes an English subject to anyone", () => {
    // It went to the support mailbox as "Enterprise Plan Inquiry" (סב60c, ב10).
    // Since 5.10 the top package is self-serve, bought inside an event like the
    // other one, so the card has no mailbox at all — a "צרו קשר" on it would
    // contradict the pricing page, which sells it with a price.
    const s = src("./AccountScreen.jsx");
    expect(s).not.toMatch(/Enterprise Plan Inquiry/);
    expect(s).not.toMatch(/contactMailto\(/);
  });
});
