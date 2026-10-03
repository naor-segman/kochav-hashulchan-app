// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const EventSiteEditorScreen = (await import("./EventSiteEditorScreen.jsx")).default;

const makeEvent = (site = {}) => normalizeEvent({
  id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2026-12-01",
  tokens: { invite: "tok-invite", album: "tok-album" },
  eventSite: { enabled: true, ...site },
});

const show = (ev = makeEvent()) =>
  render(
    <MemoryRouter>
      <EventSiteEditorScreen activeEvent={ev} patchEvent={vi.fn()} showToast={vi.fn()} />
    </MemoryRouter>,
  );

/* נ: the editor offered "דומיין משלכם" with CNAME instructions, and nothing in
 * the product ever read `site.customDomain`. A host could buy a domain, point
 * it at us, and get nothing. */
describe("EventSiteEditorScreen — no custom-domain field (נ)", () => {
  it("does not offer a custom domain, even when one is stored", () => {
    show(makeEvent({ customDomain: "dana-and-yossi.co.il" }));
    expect(screen.queryByLabelText(/דומיין/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/דומיין משלכם|CNAME/);
  });

  it("and the stored value is untouched by the normalizer (it still round-trips)", () => {
    expect(makeEvent({ customDomain: "dana-and-yossi.co.il" }).eventSite.customDomain)
      .toBe("dana-and-yossi.co.il");
  });
});
