// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* WORKPLAN 110 (1.10): the site showed the latest 12 blessings and said
 * nothing past that — the guest who left the 13th could not find it. */
let rows = [];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchGiftWall: async () => rows }));
const { default: EventSiteScreen } = await import("./EventSiteScreen.jsx");

const wishes = (n) => Array.from({ length: n }, (_, i) => ({ id: "w" + i, donor_name: "אורח " + i, message: "מזל טוב" }));
const open = () => render(
  <MemoryRouter>
    <EventSiteScreen localEvent={{ name: "החתונה", type: "חתונה", date: "2027-06-01", brideName: "דנה", groomName: "יוסי",
      eventSite: { ...defaultEventSite("חתונה"), enabled: true }, tokens: { gift: "gifttok123" } }} />
  </MemoryRouter>
);

describe("blessings on the event site", () => {
  it("past 12, a link to the full wall says how many there are", async () => {
    rows = wishes(15);
    open();
    const link = await screen.findByRole("link", { name: /לכל 15 הברכות/ });
    expect(link).toHaveAttribute("href", "/gift/gifttok123/wall");
  });
  it("12 or fewer: no link, all of them are on the page", async () => {
    rows = wishes(12);
    open();
    await screen.findByText("אורח 11");
    expect(screen.queryByRole("link", { name: /לכל .* הברכות/ })).toBeNull();
  });
});
