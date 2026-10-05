// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import EventHubScreen from "./EventHubScreen.jsx";

/**
 * The event's front page, and the one screen that states the ROW/SEAT
 * distinction out loud: "12 רשומות · 31 מקומות".
 *
 * That distinction is a named invariant — `guestSeats(g) = g.count || 1`, a
 * guest row is a GROUP and `count` is how many chairs it occupies — and it is
 * the kind of thing that reads correctly right up until every guest in the test
 * fixture has count 1, at which point rows and seats are the same number and a
 * `.length` where a `reduce` belongs passes everything. Every fixture here has
 * mixed counts on purpose, so rows ≠ seats ≠ seated and no two of the three can
 * be swapped without a failure.
 *
 * The seating percentage is the same hazard one level up: seated SEATS over
 * total SEATS. Counting rows there tells a host with four families of six that
 * they are 50% done when they have placed 6 of 26 chairs.
 */

const guest = (id, count, seatedAt) => ({ id, name: "אורח " + id, count, seatedAt });

// 4 rows, 4 + 6 + 1 + 2 = 13 seats. Two rows seated: 4 + 2 = 6 seats at t1/t2.
const EV = {
  id: "e1",
  name: "החתונה של דנה ויוסי",
  type: "חתונה",
  date: "",
  venue: "",
  guests: [guest("g1", 4), guest("g2", 6), guest("g3", 1), guest("g4", 2)],
  tables: [{ id: "t1", name: "1", capacity: 10, shape: "round" },
           { id: "t2", name: "2", capacity: 12, shape: "round" }],
  seating: { g1: "t1", g4: "t2" },
  constraints: [],
  tasks: [],
  vendors: [],
};

// The REAL AuthProvider, not a stub: `supabase` is null without VITE_SUPABASE_*
// env vars, so it resolves synchronously to a logged-out guest and never opens a
// socket. Stubbing it would only hide a future change to its shape.
const renderHub = (over = {}, props = {}) =>
  render(
    <AuthProvider>
      <MemoryRouter>
        <EventHubScreen activeEvent={{ ...EV, ...over }} go={vi.fn()} showToast={vi.fn()} {...props} />
      </MemoryRouter>
    </AuthProvider>
  );


describe("EventHubScreen — rows are not seats", () => {
  it("reports guest ROWS and guest SEATS as two different numbers", () => {
    renderHub();
    // 4 rows, 13 seats. `guests.length` for both would read "4 רשומות · 4 מקומות".
    expect(screen.getByText("4 רשומות · 13 מקומות")).toBeInTheDocument();
  });

  it("treats a row with no count as exactly one seat, never zero", () => {
    // `g.count` is optional on legacy rows. `s + g.count` (no `|| 1`) yields NaN
    // and the hub renders "NaN מקומות"; `s + (g.count || 0)` silently loses the
    // whole row and undercounts the venue.
    renderHub({ guests: [{ id: "a", name: "א" }, { id: "b", name: "ב", count: 3 }] });
    expect(screen.getByText("2 רשומות · 4 מקומות")).toBeInTheDocument();
  });

  it("computes the seating percentage over SEATS, not over rows", () => {
    // Seated seats 4 + 2 = 6 of 13 → 46%. Counting rows gives 2 of 4 = 50%,
    // which is close enough to look right and wrong enough to matter.
    renderHub();
    expect(screen.getByText("46% מהמקומות שובצו")).toBeInTheDocument();
    expect(screen.queryByText("50% מהמקומות שובצו")).toBeNull();
  });

  it("counts capacity in seats and tables in tables", () => {
    // 2 tables, 22 chairs. The two numbers live in one string and the units are
    // only distinguishable by the Hebrew word after them.
    renderHub();
    expect(screen.getByText("2 שולחנות · 22 מקומות")).toBeInTheDocument();
  });

  it("counts RSVPs in rows, because an answer belongs to the row that gave it", () => {
    // The other side of the same coin: this one is deliberately NOT seats. One
    // person answers for their whole family, and "3 אישרו" means three replies.
    renderHub({
      guests: [
        { id: "a", name: "א", count: 5, rsvp: "confirmed" },
        { id: "b", name: "ב", count: 2, rsvp: "declined" },
        { id: "c", name: "ג", count: 1 },
      ],
    });
    expect(screen.getByText("1 אישרו מתוך 3")).toBeInTheDocument();
  });

  it("a declined guest needs no seat — same numbers as the seating screen", () => {
    // Browser audit 28.9: 60 seats with 12 declined read "60 מקומות · 28%" here
    // and 48 seats / 35% on the seating screen. g2 (6 seats) declines — and
    // stays seated, which is the case that also inflated the numerator.
    renderHub({
      guests: [guest("g1", 4), { ...guest("g2", 6), rsvp: "declined" }, guest("g3", 1), guest("g4", 2)],
      seating: { g1: "t1", g2: "t1", g4: "t2" },
    });
    // 3 active rows, 4 + 1 + 2 = 7 seats; seated 4 + 2 = 6 → 86%.
    expect(screen.getByText("3 רשומות · 7 מקומות · 1 לא מגיעים")).toBeInTheDocument();
    expect(screen.getByText("86% מהמקומות שובצו")).toBeInTheDocument();
  });

  it("an all-declined list is not called empty", () => {
    renderHub({ guests: [{ ...guest("g1", 2), rsvp: "declined" }], seating: {} });
    expect(screen.getByText("1 לא מגיעים")).toBeInTheDocument();
    expect(screen.queryByText("הרשימה ריקה")).toBeNull();
  });

  it("does not divide by zero on an event with no guests yet", () => {
    renderHub({ guests: [], seating: {} });
    expect(screen.getByText("הרשימה ריקה")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("blocks every tool except setup until the event has a name, and says why", () => {
    // The rail enforced this and the hub did not, so the identical click was
    // refused from one place and allowed from the other — and half the product
    // keys off the event name.
    const go = vi.fn(), showToast = vi.fn();
    renderHub({ name: "" }, { go, showToast });

    fireEvent.click(screen.getByText("אורחים"));
    expect(showToast).toHaveBeenCalledWith("יש להזין שם לאירוע לפני המשך", "err");
    expect(go).toHaveBeenCalledWith("setup");
    expect(go).not.toHaveBeenCalledWith("guests");

    go.mockClear(); showToast.mockClear();
    fireEvent.click(screen.getByText("פרטי האירוע"));
    expect(showToast).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith("setup");
  });

  it("lets every tool through once the event is named", () => {
    const go = vi.fn(), showToast = vi.fn();
    renderHub({}, { go, showToast });
    fireEvent.click(screen.getByText("אורחים"));
    expect(showToast).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith("guests");
  });
});

describe("EventHubScreen — signing up from inside a draft (33d)", () => {
  it("the guest-mode signup link carries this browser's drafts into the new account", () => {
    // Without the mark, a host who signs up from here lands on an empty
    // dashboard behind a "is this yours?" banner about the event they were just in.
    sessionStorage.clear();
    renderHub();
    fireEvent.click(screen.getByText("פתחו חשבון חינם"));
    expect(Number(sessionStorage.getItem("kochav_carry_drafts"))).toBeGreaterThan(0);
  });
});

/* 136 stage D — the one-time "the event is open" moment. App.jsx startEvent
   navigates with { created: true }; anything else (a reload, the dashboard,
   a link) opens the hub without it. */
describe("EventHubScreen — the moment the event is created", () => {
  const fresh = { guests: [], tables: [], seating: {} };
  const renderAt = (entry, over = {}) =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[entry]}>
          <EventHubScreen activeEvent={{ ...EV, ...fresh, ...over }} go={vi.fn()} showToast={vi.fn()} />
        </MemoryRouter>
      </AuthProvider>
    );

  it("says mazal tov, how many steps are left, and that nothing must be done today", () => {
    renderAt({ pathname: "/events/e1", state: { created: true } });
    expect(screen.getByRole("heading", { name: "מזל טוב — האירוע נפתח" })).toBeInTheDocument();
    // Setup is done (the event has a name): four left.
    expect(screen.getByText(/מכאן זה עוד ארבעה צעדים/)).toBeInTheDocument();
    expect(screen.getByText(/אפשר לעצור ולחזור מתי שרוצים/)).toBeInTheDocument();
  });

  it("does not say mazal tov to a company event", () => {
    renderAt({ pathname: "/events/e1", state: { created: true } }, { type: "אירוע עסקי" });
    expect(screen.getByRole("heading", { name: "האירוע נפתח" })).toBeInTheDocument();
    expect(screen.queryByText(/מזל טוב/)).toBeNull();
  });

  it("is not there when the hub is opened any other way", () => {
    renderAt("/events/e1");
    expect(screen.queryByText(/האירוע נפתח/)).toBeNull();
  });
});

describe("EventHubScreen — no wall of zeros on an empty event", () => {
  it("hides the numbers when there are no guests and no date, shows them otherwise", () => {
    const { unmount } = renderHub({ guests: [], seating: {}, date: "" });
    expect(screen.queryByText("מוזמנים")).toBeNull();
    unmount();
    renderHub();
    expect(screen.getByText("מוזמנים")).toBeInTheDocument();
  });
});
