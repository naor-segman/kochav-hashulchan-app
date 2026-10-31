// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../test/dom.js";

/* 136 stage D (31.10): the rules for how an answer reaches the list were the
 * page's five-line subtitle. A short subtitle now; the rules, word for word,
 * in a fold. And the empty state has its drawing (the illustration set). */
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => [] }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

const EV = { id: "e1", cloudId: "c1", name: "x", type: "חתונה", tables: [], seating: {}, eventSite: {},
             tokens: { rsvp: "r1" }, guests: [] };

describe("RSVPResponsesScreen — the new design", () => {
  it("a short subtitle; the rules folded, closed", async () => {
    render(<RSVPResponsesScreen activeEvent={EV} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByText("מי ענה, מה ענה, ותחזית מנות.")).toBeTruthy();
    const fold = screen.getByText("איך תשובה נכנסת לרשימת האורחים?").closest("details");
    expect(fold.open).toBe(false);
    expect(fold.textContent).toMatch(/תשובה שזוהתה לפי טלפון מתעדכנת ברשימה/);
  });

  it("no answers yet: the phone drawing above the share link", async () => {
    render(<RSVPResponsesScreen activeEvent={EV} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    await screen.findByText("עדיין אין תשובות");
    expect(document.querySelector('[data-illustration="phone"]')).not.toBeNull();
  });
});
