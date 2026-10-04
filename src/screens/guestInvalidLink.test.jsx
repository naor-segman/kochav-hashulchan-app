// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, waitFor } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import { COMPANY } from "../data/company.js";

/* Audit 3.10, P2-7. A dead link said eight different things across ten guest
 * pages — "הלינק לא תקין…", "ההזמנה לא נמצאה", "האלבום לא נמצא", "הדף לא
 * נמצא", "הקישור לקיר הברכות אינו תקין." … Every page now says the one
 * sentence in publicTokens.js. This renders every guest route with a token
 * that resolves to nothing and reads the heading and the explanation back. */

let EVENT = null;
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => EVENT,
  fetchGiftWall: async () => [],
  fetchAlbumPhotos: async () => [],
  fetchCollabEvent: async () => null,
  fetchCollabGuests: async () => [],
  fetchHostessData: async () => null,
}));
const { INVALID_LINK_TEXT } = await import("../utils/publicTokens.js");
const PAGES = {
  "/gift/:token":          (await import("./GiftScreen.jsx")).default,
  "/gift/:token/wall":     (await import("./GiftWallScreen.jsx")).default,
  "/rsvp/:token":          (await import("./RSVPScreen.jsx")).default,
  "/invite/:token":        (await import("./EventSiteScreen.jsx")).default,
  "/card/:token":          (await import("./InviteScreen.jsx")).default,
  "/album/:token":         (await import("./AlbumScreen.jsx")).default,
  "/collab/:token":        (await import("./CollabScreen.jsx")).default,
};
const { default: AnnouncementScreen } = await import("./AnnouncementScreen.jsx");
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

// A production-shaped render: in dev, several pages show a made-up event
// instead of the not-found state (106).
beforeEach(() => { vi.stubEnv("DEV", false); });
afterEach(() => { EVENT = null; vi.useRealTimers(); vi.unstubAllEnvs(); });

const at = (route, el) => render(
  <AuthProvider><MemoryRouter initialEntries={[route.replace(":token", "tok12345678")]}>
    <Routes><Route path={route} element={el} /></Routes>
  </MemoryRouter></AuthProvider>,
);

async function readsTheOneSentence() {
  const h1 = await screen.findByRole("heading", { level: 1 });
  expect(h1.textContent).toBe(INVALID_LINK_TEXT.title);
  expect(document.body.textContent).toContain(INVALID_LINK_TEXT.body);
  // Slang for the same word, on two of the pages.
  expect(document.body.textContent).not.toMatch(/לינק/);
}

describe("a guest link that resolves to nothing says one thing everywhere", () => {
  for (const [route, Page] of Object.entries(PAGES)) {
    it(route, async () => { at(route, <Page />); await readsTheOneSentence(); });
  }
  it("/save-the-date/:token", async () => { at("/save-the-date/:token", <AnnouncementScreen kind="saveTheDate" />); await readsTheOneSentence(); });
  it("/invitation/:token", async () => { at("/invitation/:token", <AnnouncementScreen kind="invitation" />); await readsTheOneSentence(); });
  it("/hostess/:token", async () => { at("/hostess/:token", <EntranceScreen mode="token" />); await readsTheOneSentence(); });
});

/* And the save-the-date the day after: it still said "שמרו את התאריך" and
 * offered "הוסיפו ליומן" for a date that had passed. */
describe("the save-the-date after the event", () => {
  const event = (date) => ({
    name: "החתונה של דנה ויוסי", type: "חתונה", date, brideName: "דנה", groomName: "יוסי",
    rsvpToken: "r1", inviteToken: "i1", site: { enabled: true },
    announcements: { saveTheDate: { enabled: true, showRsvp: true, message: "פרטים בהמשך" } },
  });
  // Israel, the morning of 4 October 2026.
  const now = () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-04T09:00:00+03:00")); };

  it("before: announces, with the calendar", async () => {
    now(); EVENT = event("2026-10-20");
    at("/save-the-date/:token", <AnnouncementScreen kind="saveTheDate" />);
    expect(await screen.findByText("שמרו את התאריך")).toBeTruthy();
    expect(screen.getByText(/הוסיפו ליומן/)).toBeTruthy();
  });

  it("the day itself still counts as before", async () => {
    now(); EVENT = event("2026-10-04");
    at("/save-the-date/:token", <AnnouncementScreen kind="saveTheDate" />);
    expect(await screen.findByText("שמרו את התאריך")).toBeTruthy();
  });

  it("the day after: says it took place, no calendar, no RSVP, the site stays", async () => {
    now(); EVENT = event("2026-10-03");
    at("/save-the-date/:token", <AnnouncementScreen kind="saveTheDate" />);
    expect(await screen.findByText("האירוע התקיים")).toBeTruthy();
    const text = document.body.textContent;
    expect(text).not.toContain("שמרו את התאריך");
    expect(text).not.toContain("הוסיפו ליומן");
    expect(text).not.toContain("אישור הגעה");
    expect(text).not.toContain("פרטים בהמשך");
    expect(text).not.toContain("מתחתנים");
    expect(screen.getByRole("link", { name: /לאתר האירוע/ }).getAttribute("href")).toBe("/invite/i1");
  });
});

/* Audit 3.10, leftovers: a save-the-date or invitation the host has not
 * published yet. The page says "הדף עדיין לא פורסם", but the tab said
 * "שמרו את התאריך · דנה ויוסי" — the title of the page the guest is told
 * does not exist yet. It now names its own state, as the dead link and the
 * offline state do: "<the page's h1> · <brand>". */
describe("an unpublished announcement names its state in the tab", () => {
  const unpublished = {
    name: "החתונה של דנה ויוסי", type: "חתונה", date: "2099-10-20", brideName: "דנה", groomName: "יוסי",
    rsvpToken: "r1", inviteToken: "i1", site: { enabled: true },
    announcements: { saveTheDate: { enabled: false }, invitation: { enabled: false } },
  };
  for (const [route, kind] of [["/save-the-date/:token", "saveTheDate"], ["/invitation/:token", "invitation"]]) {
    it(route, async () => {
      EVENT = unpublished;
      document.title = "default";
      at(route, <AnnouncementScreen kind={kind} />);
      const h1 = await screen.findByRole("heading", { level: 1 });
      expect(h1.textContent).toBe("הדף עדיין לא פורסם");
      await waitFor(() => expect(document.title).toBe(`הדף עדיין לא פורסם · ${COMPANY.name}`));
    });
  }
  it("once published, the tab names the page and the hosts again", async () => {
    EVENT = { ...unpublished, announcements: { saveTheDate: { enabled: true } } };
    at("/save-the-date/:token", <AnnouncementScreen kind="saveTheDate" />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.title).toBe("שמרו את התאריך · דנה ויוסי"));
  });
});
