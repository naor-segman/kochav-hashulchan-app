// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* 38a — every page has exactly one <main>.
 *
 * Measured 1.10: 29 of 43 routes had no main landmark at all — the landing
 * page, pricing, all six service pages, the guest pages (most of their states),
 * login / signup / reset, the 404. A screen-reader user's "jump to main" key
 * did nothing on exactly the pages a stranger lands on first.
 *
 * Two layers, because a landmark lost in a refactor is silent:
 *   1. render the pages that render without a server, and count;
 *   2. a source guard over App.jsx's route table — every component a route
 *      renders is classified below, so a NEW route fails here until someone
 *      decides where its <main> is. */

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }) => children,
}));

// jsdom has no layout or media APIs the marketing pages touch.
Element.prototype.scrollIntoView ??= () => {};
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};

const imp = async (p) => (await import(p)).default;

const MARKETING = {
  "/":                    await imp("./LandingScreen.jsx"),
  "/pricing":             await imp("./PricingScreen.jsx"),
  "/services/seating":    await imp("./services/SeatingServiceScreen.jsx"),
  "/services/event-site": await imp("./services/EventSiteServiceScreen.jsx"),
  "/services/planning":   await imp("./services/PlanningServiceScreen.jsx"),
  "/services/rsvp":       await imp("./services/RsvpServiceScreen.jsx"),
  "/services/event-day":  await imp("./services/EventDayServiceScreen.jsx"),
  "/services/gifts":      await imp("./services/GiftsServiceScreen.jsx"),
};

const STANDALONE = {
  "/login":          await imp("./LoginScreen.jsx"),
  "/signup":         await imp("./SignupScreen.jsx"),
  "/reset-password": await imp("./ResetPasswordScreen.jsx"),
  "/auth/callback":  await imp("./AuthCallbackScreen.jsx"),
  "/no-such-page":   await imp("./NotFoundScreen.jsx"),
  "/admin/login":    await imp("../admin/screens/AdminLoginScreen.jsx"),
};

const mains = () => document.querySelectorAll("main, [role=main]");

describe("the marketing pages: one <main>, and SiteHeader's skip link reaches it (38a, AX9)", () => {
  for (const [path, Page] of Object.entries(MARKETING)) {
    it(path, () => {
      render(<MemoryRouter initialEntries={[path]}><Page user={null} /></MemoryRouter>);
      expect(mains()).toHaveLength(1);
      const main = screen.getByRole("main");
      expect(main.id).toBe("main");
      // The page's h1 is inside it, the site header and footer are not.
      expect(main.querySelector("h1")).not.toBeNull();
      expect(main.closest("header, footer")).toBeNull();
      expect(main.querySelector("header nav, footer")).toBeNull();

      const skip = screen.getByRole("link", { name: "דלגו לתוכן" });
      expect(document.querySelectorAll("a[href], button")[0]).toBe(skip);
      fireEvent.click(skip);
      expect(document.activeElement).toBe(main);
    });
  }
});

describe("the standalone pages: one <main> (38a)", () => {
  for (const [path, Page] of Object.entries(STANDALONE)) {
    it(path, async () => {
      render(<MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>);
      await waitFor(() => expect(mains()).toHaveLength(1));
      expect(screen.getByRole("main").textContent.trim()).not.toBe("");
    });
  }

  it("the 404 inside an event is not a second <main> inside Shell's", () => {
    const NotFound = STANDALONE["/no-such-page"];
    render(<MemoryRouter><NotFound landmark={false} /></MemoryRouter>);
    expect(mains()).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("הדף לא נמצא");
  });
});

/* ── The guest pages, in the state a server-less render reaches ─────────────
   With Supabase unset each of these lands in one state (a mock event, or "not
   available"); the browser harness covers loaded / invalid / unreachable on a
   production-shaped build. This proves the state rendered here has its main. */
const GUEST = [
  ["/rsvp/:token",          "/rsvp/t1",          "./RSVPScreen.jsx",         {}],
  ["/invite/:token",        "/invite/t1",        "./EventSiteScreen.jsx",    {}],
  ["/card/:token",          "/card/t1",          "./InviteScreen.jsx",       {}],
  ["/gift/:token",          "/gift/t1",          "./GiftScreen.jsx",         {}],
  ["/gift/:token/wall",     "/gift/t1/wall",     "./GiftWallScreen.jsx",     {}],
  ["/album/:token",         "/album/t1",         "./AlbumScreen.jsx",        {}],
  ["/invitation/:token",    "/invitation/t1",    "./AnnouncementScreen.jsx", { kind: "invitation" }],
  ["/save-the-date/:token", "/save-the-date/t1", "./AnnouncementScreen.jsx", { kind: "saveTheDate" }],
  ["/collab/:token",        "/collab/t1",        "./CollabScreen.jsx",       {}],
];

describe("the guest pages: one <main> in the state that renders without a server (38a)", () => {
  for (const [pattern, url, file, props] of GUEST) {
    it(url, async () => {
      const Page = await imp(file);
      render(
        <MemoryRouter initialEntries={[url]}>
          <Routes><Route path={pattern} element={<Page {...props} />} /></Routes>
        </MemoryRouter>,
      );
      await waitFor(() => expect(document.querySelector("[role=status]")?.textContent ?? "").not.toMatch(/טוען/));
      expect(mains()).toHaveLength(1);
    });
  }
});

/* ── Source guard over the route table ─────────────────────────────────────── */

const read = (f) => readFileSync(f, "utf8");
const hasMain = (f) => /<main[\s>]|"main"/.test(read(f));

/** Rendered by a top-level route and must hold the page's own <main>. */
const OWN_MAIN = {
  LandingScreen: "src/screens/LandingScreen.jsx",
  PricingScreen: "src/screens/PricingScreen.jsx",
  SeatingServiceScreen:   "src/screens/services/SeatingServiceScreen.jsx",
  EventSiteServiceScreen: "src/screens/services/EventSiteServiceScreen.jsx",
  PlanningServiceScreen:  "src/screens/services/PlanningServiceScreen.jsx",
  RsvpServiceScreen:      "src/screens/services/RsvpServiceScreen.jsx",
  EventDayServiceScreen:  "src/screens/services/EventDayServiceScreen.jsx",
  GiftsServiceScreen:     "src/screens/services/GiftsServiceScreen.jsx",
  GiftWallScreen:     "src/screens/GiftWallScreen.jsx",
  GiftScreen:         "src/screens/GiftScreen.jsx",
  RSVPScreen:         "src/screens/RSVPScreen.jsx",
  EventSiteScreen:    "src/screens/EventSiteScreen.jsx",
  InviteScreen:       "src/screens/InviteScreen.jsx",
  AlbumScreen:        "src/screens/AlbumScreen.jsx",
  AnnouncementScreen: "src/screens/AnnouncementScreen.jsx",
  CollabScreen:       "src/screens/CollabScreen.jsx",
  LoginScreen:         "src/screens/LoginScreen.jsx",
  SignupScreen:        "src/screens/SignupScreen.jsx",
  ResetPasswordScreen: "src/screens/ResetPasswordScreen.jsx",
  AccountScreen:       "src/screens/AccountScreen.jsx",
  AuthCallbackScreen:  "src/screens/AuthCallbackScreen.jsx",
  HelpScreen:          "src/screens/HelpScreen.jsx",
  PrivacyScreen:       "src/screens/PrivacyScreen.jsx",
  TermsScreen:         "src/screens/TermsScreen.jsx",
  RefundScreen:        "src/screens/RefundScreen.jsx",
  AccessibilityScreen: "src/screens/AccessibilityScreen.jsx",
  FeedbackScreen:      "src/screens/FeedbackScreen.jsx",
  NotFoundScreen:      "src/screens/NotFoundScreen.jsx",
};
/** Rendered inside Shell, whose <main id="main"> is the page's — or plumbing. */
const NO_OWN_MAIN = new Set([
  "Suspense", "Loading", "Navigate", "Toast", "MigrationBanner",
  "Shell", "DashboardScreen", "StartScreen", "EventRoutes",
  // Thin wrappers around EventSiteScreen / AnnouncementScreen (above).
  "EventSitePreview", "AnnouncementPreview",
  // Its own route table — its screens are checked below.
  "AdminApp",
]);
/** Known gaps, each with its reason. Shrink this list; never grow it quietly. */
const PENDING = new Set([
  // The door screen (/entrance, /hostess, /checkin) — left for a later pass
  // while another change to EntranceScreen.jsx is in flight.
  "EntranceScreen",
]);

describe("App.jsx's route table: every page component is accounted for (38a)", () => {
  const app = read("src/App.jsx");
  const body = app.slice(app.indexOf("function AppRoutes"));
  const table = body.slice(body.indexOf("<Routes>"), body.indexOf("</Routes>"));
  const used = [...new Set([...table.matchAll(/<([A-Z]\w+)/g)].map(m => m[1]))].filter(n => n !== "Route" && n !== "Routes");

  it("finds the route table", () => {
    expect(used.length).toBeGreaterThan(30);
  });

  it("names no component it has not classified", () => {
    const unknown = used.filter(n => !(n in OWN_MAIN) && !NO_OWN_MAIN.has(n) && !PENDING.has(n));
    expect(unknown).toEqual([]);
  });

  it("every page that owns its landmark has a <main> in its source", () => {
    const missing = Object.entries(OWN_MAIN).filter(([, f]) => !hasMain(f)).map(([n]) => n);
    expect(missing).toEqual([]);
  });

  it("Shell has exactly one, and the 404 inside it opts out of its own", () => {
    expect(read("src/components/layout/Shell.jsx").match(/<main\s/g)).toHaveLength(1);
    const events = app.slice(app.indexOf("function EventRoutes"), app.indexOf("function EventSitePreview"));
    expect(events).toMatch(/<NotFoundScreen landmark=\{false\} \/>/);
  });

  // The guest pages render a different tree per state (loading / not found /
  // no connection / loaded). These are the wrappers that were each a state's
  // outer element and are now its <main> — one left as a div is a state with
  // no landmark.
  it("no guest-page state wrapper is back to a <div>", () => {
    const WRAPPERS = /<div className=\{styles\.(state|stateWrap|stateCenter|loadingWrap|cardWrap|successWrap)\}/;
    const offenders = ["GiftWallScreen", "GiftScreen", "RSVPScreen", "EventSiteScreen", "InviteScreen",
      "AlbumScreen", "AnnouncementScreen", "CollabScreen"]
      .filter(n => WRAPPERS.test(read(OWN_MAIN[n])));
    expect(offenders).toEqual([]);
  });

  it("every admin screen has a <main>", () => {
    const admin = read("src/admin/AdminApp.jsx");
    const screens = [...admin.matchAll(/import (Admin\w+Screen)\s+from "\.\/screens\/(\w+)\.jsx"/g)];
    expect(screens.length).toBeGreaterThan(8);
    const missing = screens.filter(([, , f]) => !hasMain(`src/admin/screens/${f}.jsx`)).map(([, n]) => n);
    expect(missing).toEqual([]);
  });
});
