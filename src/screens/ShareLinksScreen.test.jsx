// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";

// THE HOLE THIS CLOSES, and it took two attempts to see it.
//
// Item 1 gave the blessing wall a share link. Its address is the only one that
// is not prefix+token — it ends `/wall` — so `shareLinks.js` grew a `suffix`
// field. A review then found the test proved nothing: the SCREEN concatenated
// the URL inline and the TEST re-implemented the same concatenation, so
// deleting `+ (sl.suffix || "")` from the screen left all 1,109 tests green.
//
// The response was to extract `shareUrl()` and have both call it. That was
// still not enough, and a second adversarial review caught it: nothing asserted
// the SCREEN calls that function. Re-measured here before writing this file —
// replacing `shareUrl(sl, origin, token)` in ShareLinksScreen with
// `origin + sl.path + token` and dropping the import left ALL of it green:
// 1,152 tests, eslint src, cssmod, build, qa/shareLinksUi.mjs.
//
// qa/shareLinksUi.mjs cannot cover it: `isGuest = !user`, there is no Supabase
// session in that environment, and the signed-out view renders no URLs at all.
// So the assertion has to be here, on the rendered output of the real screen
// with a signed-in user. What the host copies is what gets tested.
//
// If a host copies /gift/<token> instead of /gift/<token>/wall they hand their
// guests the donation FORM where the projection was meant to go.

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const ShareLinksScreen = (await import("./ShareLinksScreen.jsx")).default;
const { SHARE_GROUPS, shareUrl } = await import("../components/share/shareLinks.js");

const EVENT = {
  id: "e1",
  name: "החתונה של דנה ויוסי",
  tokens: {
    rsvp: "tok-rsvp", invite: "tok-invite", gift: "tok-gift",
    album: "tok-album", hostess: "tok-hostess", collab: "tok-collab",
    saveTheDate: "tok-std", invitation: "tok-inv", card: "tok-card",
  },
};

const renderScreen = () =>
  render(
    <MemoryRouter>
      <ShareLinksScreen activeEvent={EVENT} go={() => {}} showToast={() => {}} />
    </MemoryRouter>,
  );

/** Every URL the screen actually put on the page, from the inputs the host copies. */
function renderedUrls() {
  return [...document.querySelectorAll("input")]
    .map((i) => i.value)
    .filter((v) => typeof v === "string" && v.includes("/"));
}

describe("the URLs the host copies off the screen", () => {
  it("renders one per link, with the origin and the event's token", () => {
    renderScreen();
    const urls = renderedUrls();
    const expected = SHARE_GROUPS.flatMap((g) => g.links);
    // Not `>= 1`: an inequality tolerates the query silently narrowing, and a
    // screen that renders half its links would still pass.
    expect(urls.length).toBe(expected.length);
    for (const link of expected) {
      const want = shareUrl(link, window.location.origin, EVENT.tokens[link.tokenKey] || "");
      expect(urls, `${link.key} is not on the screen as ${want}`).toContain(want);
    }
  });

  it("gives the blessing wall its /wall suffix — the whole point of item 1", () => {
    renderScreen();
    const urls = renderedUrls();
    // Stated as a literal, deliberately. Deriving it from shareLinks.js would
    // re-create exactly the circularity this file exists to break: the source
    // of the bug and the oracle for it must not be the same expression.
    expect(urls).toContain(`${window.location.origin}/gift/tok-gift/wall`);
    // And the donation form must still be its own separate link — the two
    // differ only by the suffix, which is what made the bug survivable.
    expect(urls).toContain(`${window.location.origin}/gift/tok-gift`);
  });

  it("does not hand out a bare /gift where the wall belongs", () => {
    renderScreen();
    const wall = SHARE_GROUPS.flatMap((g) => g.links).find((l) => l.key === "giftWall");
    expect(wall, "the giftWall link was removed from shareLinks.js").toBeTruthy();
    // The row's own input, located through its visible label, so this fails if
    // the wall's URL regresses even when some OTHER row happens to carry /wall.
    const label = screen.getByText(wall.label);
    const row = label.closest("li");
    const input = row.querySelector("input");
    expect(input.value).toBe(`${window.location.origin}/gift/tok-gift/wall`);
  });
});
