// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import GuestManagerScreen from "./GuestManagerScreen.jsx";

/**
 * The guest edit form, which is bug class 3 — "a field ABSENT from an incoming
 * record read as an instruction to CLEAR it" — wearing a different hat.
 *
 * A guest row is the only place in this product where a host types something
 * nothing else can reconstruct: a companion's name is not derivable from
 * anything. The form seeds itself from a SUBSET of the row and writes a row
 * back, and it is one careless `Object.assign` away from erasing everything it
 * did not think to copy. It has already cost the owner eight hand-typed names
 * once — the root cause was the collab RPC, but this form was one line away
 * from being the second cause, which is why utils/guestForm.js exists.
 *
 * guestForm.test.js already pins those rules as pure functions. What it CANNOT
 * pin is that this screen still calls them: `applyGuestForm(g, form, group)`
 * "simplified" to `{ ...g, ...form }` passes every existing test in the repo and
 * destroys `arrived`, `arrivedSeats` and the gift recorded at the door. That
 * wiring is what these tests hold.
 */

// A guest carrying three kinds of field the form does NOT own:
//   • answers given at the door        — arrived / arrivedSeats
//   • money recorded on the day        — gift
//   • companion names past the seat count, which the form renders none of
const SEATED_FAMILY = {
  id: "g1",
  name: "משפחת כהן",
  phone: "050-1111111",
  side: "bride",
  group: "משפחה קרובה",
  count: 4,
  companions: ["רותי", "יובל", "נועם", "אורי", "שירה"],
  notes: "אלרגיה לאגוזים",
  rsvp: "confirmed",
  meal: "regular",
  arrived: true,
  arrivedSeats: [0, 1],
  gift: 1200,
  checkedInAt: 1750000000000,
};

const EV = {
  id: "e1",
  name: "החתונה של דנה ויוסי",
  type: "חתונה",
  guests: [SEATED_FAMILY],
  tables: [],
  seating: {},
  constraints: [],
  customGroups: [],
  tokens: {},
};

/** Render, then apply whatever updater patchEvent was handed, and return the row. */
function renderGuests(over = {}) {
  const patchEvent = vi.fn();
  const showToast = vi.fn();
  const tree = (ev) => (
    <AuthProvider>
      <GuestManagerScreen
        activeEvent={ev}
        patchEvent={patchEvent}
        go={vi.fn()}
        showToast={showToast}
      />
    </AuthProvider>
  );
  const { rerender } = render(tree({ ...EV, ...over }));
  const applyLast = () => {
    const updater = patchEvent.mock.calls.at(-1)[0];
    return typeof updater === "function" ? updater({ ...EV, ...over }) : updater;
  };
  // Simulates a cloud/collab sync landing while the form is open — the SAME
  // mounted component, new props. A second render() would leave the first copy
  // in the document and every query would match twice.
  const syncTo = (next) => rerender(tree({ ...EV, ...over, ...next }));
  return { patchEvent, showToast, applyLast, syncTo };
}

// The edit button scrolls the form into view; jsdom has no layout and logs
// "Not implemented" for every click otherwise.
window.scrollTo = () => {};

const startEditing = () => fireEvent.click(screen.getByText("עריכה"));
const save = () => fireEvent.click(screen.getByText("שמרו שינויים"));

describe("GuestManagerScreen — editing a guest must not blank what the form never asked about", () => {
  it("keeps arrival, gift and check-in time through a name edit", () => {
    // The event is running, the greeter has checked two of the four seats in,
    // ₪1200 is recorded — and the host fixes a typo in the name. A spread of
    // the form over the row deletes all of it, silently, mid-event.
    const { applyLast } = renderGuests();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("משפחת כהן"), { target: { value: "משפחת כהן־לוי" } });
    save();

    const g = applyLast().guests[0];
    expect(g.name).toBe("משפחת כהן־לוי");
    expect(g.arrived).toBe(true);
    expect(g.arrivedSeats).toEqual([0, 1]);
    expect(g.gift).toBe(1200);
    expect(g.checkedInAt).toBe(1750000000000);
  });

  it("keeps companion names the form does not even render", () => {
    // count is 4, so the form draws THREE companion boxes. Positions 4 and 5
    // exist because the host once reserved six chairs and later lowered it.
    // Saving must not be the thing that finally deletes those two names.
    const { applyLast } = renderGuests();
    startEditing();
    expect(screen.getAllByLabelText(/שם המצטרף/)).toHaveLength(3);

    fireEvent.change(screen.getByDisplayValue("אלרגיה לאגוזים"), { target: { value: "אלרגיה לאגוזים ולגלוטן" } });
    save();

    expect(applyLast().guests[0].companions).toEqual(["רותי", "יובל", "נועם", "אורי", "שירה"]);
  });

  it("changes ONE companion and leaves the other positions byte-identical", () => {
    // The owner's own complaint: "אם אני רוצה לשנות מלווה אחד אני צריך להקליד
    // שוב את כל השאר". Position is meaning — "מלווה 2" is always the second
    // seat — so a rebuild-the-array edit shifts every name after it.
    const { applyLast } = renderGuests();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("יובל"), { target: { value: "יובל כהן" } });
    save();

    expect(applyLast().guests[0].companions).toEqual(["רותי", "יובל כהן", "נועם", "אורי", "שירה"]);
  });

  it("touches only the edited row and leaves the rest of the list alone", () => {
    const other = { id: "g2", name: "דוד", side: "groom", group: "חברים", count: 1, arrived: true };
    const { applyLast } = renderGuests({ guests: [SEATED_FAMILY, other] });
    fireEvent.click(screen.getAllByText("עריכה")[0]);
    fireEvent.change(screen.getByDisplayValue("משפחת כהן"), { target: { value: "כהן" } });
    save();

    const out = applyLast().guests;
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(other);
  });

  it("writes the form's TEXT fields through the converter, not raw off the inputs", () => {
    // The screen must round-trip the form through applyGuestForm rather than
    // spreading it over the row. That is easy to "simplify" to
    // `{...g, ...form}` — which keeps arrival and companions in THIS fixture,
    // so the obvious assertions above cannot see it — and it is still wrong in
    // two ways that reach real screens:
    //   • an <input type="number"> hands back a STRING. `estGift: "800"` sums
    //     as string concatenation on the budget screen, so two guests at 800
    //     and 500 become 800500 of expected income.
    //   • the name goes in untrimmed, so " כהן " sorts and dedupes as its own
    //     distinct guest.
    const { applyLast } = renderGuests();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("משפחת כהן"), { target: { value: "  משפחת לוי  " } });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "800" } });
    save();

    const g = applyLast().guests[0];
    expect(g.name).toBe("משפחת לוי");
    expect(g.estGift).toBe(800);
    expect(typeof g.estGift).toBe("number");
  });

  it("writes the seat count as a number and the row as ONE row", () => {
    // The row/seat invariant at the point of entry. `count` is chairs; the row
    // is still one record. A screen that added `count` rows instead would look
    // fine on this form and wreck every total downstream.
    const { applyLast } = renderGuests();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("4"), { target: { value: "6" } });
    save();

    const out = applyLast().guests;
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(6);
    expect(typeof out[0].count).toBe("number");
  });

  it("shows a row's seat count in the list as SEATS, not as a row count", () => {
    // "+3" is the companions badge, "4 מקומות" is the chair count. A row of
    // four people that reads "1 מקומות" is the same class of error as the hub's.
    renderGuests();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText(/4 מקומות/)).toBeInTheDocument();
  });

  it("refuses to save a blank name instead of writing an empty row", () => {
    const { patchEvent, showToast } = renderGuests();
    startEditing();
    fireEvent.change(screen.getByDisplayValue("משפחת כהן"), { target: { value: "   " } });
    save();

    expect(showToast).toHaveBeenCalledWith("יש להזין שם אורח", "err");
    expect(patchEvent).not.toHaveBeenCalled();
  });

  it("refuses to resurrect a guest that was deleted from another device mid-edit", () => {
    // The row is loaded into the form, the collab table deletes it, the host
    // presses save. Writing the form back would recreate a guest the host
    // already removed — and it would come back with no arrival state.
    const { patchEvent, showToast, syncTo } = renderGuests();
    startEditing();
    syncTo({ guests: [] });          // the delete arrives while the form is open
    save();                           // the host presses save anyway

    expect(showToast).toHaveBeenCalledWith("האורח כבר נמחק", "err");
    expect(patchEvent).not.toHaveBeenCalled();
    // …and the form closed, rather than leaving a ghost row loaded in it.
    expect(screen.queryByText("שמרו שינויים")).toBeNull();
  });
});

describe("GuestManagerScreen — adding guests", () => {
  // The paste no longer commits on one click. It goes through a review step —
  // "this is what I understood" — because no parser on free text is ever 100%
  // and the fix for that is not a better guess, it is letting the host see the
  // guess before it becomes their guest list. These walk the real two steps.
  const pasteAndReview = (text) => {
    fireEvent.click(screen.getByText("להדביק רשימה שכבר יש לכם"));
    const box = screen.getByLabelText("הדביקו כאן את רשימת השמות");
    fireEvent.change(box, { target: { value: text } });
    fireEvent.click(screen.getByText(/בדקו .* לפני ההוספה/));
  };

  it("adds a pasted list as one row per line, each row one seat", () => {
    // parseGuestList is tested on its own; this pins that the screen turns each
    // parsed line into a ROW with count 1, rather than folding them together.
    const { applyLast } = renderGuests({ guests: [] });
    pasteAndReview("דנה כהן, 050-1234567\nיוסי לוי\nרותי");
    fireEvent.click(screen.getByText(/הוסיפו 3 אורחים/));

    const out = applyLast().guests;
    expect(out).toHaveLength(3);
    expect(out.map(g => g.count)).toEqual([1, 1, 1]);
    expect(out[0].name).toBe("דנה כהן");
    expect(out[0].phone).toBe("0501234567");   // parseGuestList strips separators
  });

  it("nothing reaches the guest list until the host confirms", () => {
    // The whole point. Pasting used to BE importing.
    const { patchEvent } = renderGuests({ guests: [] });
    pasteAndReview("דנה כהן\nיוסי לוי");
    expect(patchEvent).not.toHaveBeenCalled();
    expect(screen.getByText("ככה הבנתי את הרשימה")).toBeTruthy();
  });

  it("a row the host corrects is imported as CORRECTED", () => {
    const { applyLast } = renderGuests({ guests: [] });
    pasteAndReview("דנה כהן\nיוסי לוי");
    fireEvent.change(screen.getByLabelText("שם, שורה 1"), { target: { value: "דנה לוי" } });
    fireEvent.click(screen.getByText(/הוסיפו 2 אורחים/));
    expect(applyLast().guests.map(g => g.name)).toEqual(["דנה לוי", "יוסי לוי"]);
  });

  it("a row the host removes is not imported at all", () => {
    const { applyLast } = renderGuests({ guests: [] });
    pasteAndReview("דנה כהן\nיוסי לוי");
    fireEvent.click(screen.getByLabelText("הסירו את דנה כהן מהייבוא"));
    fireEvent.click(screen.getByText(/הוסיפו 1 אורחים/));
    expect(applyLast().guests.map(g => g.name)).toEqual(["יוסי לוי"]);
  });

  it("cancelling the review goes back to the paste box, list intact", () => {
    const { patchEvent } = renderGuests({ guests: [] });
    pasteAndReview("דנה כהן");
    fireEvent.click(screen.getByText("חזרה לרשימה"));
    expect(screen.getByLabelText("הדביקו כאן את רשימת השמות").value).toBe("דנה כהן");
    expect(patchEvent).not.toHaveBeenCalled();
  });

  it("carries real CSS Modules classes on the guest rows", () => {
    // Bug class 9 at screen scale: screenBase.module.css is shared by every
    // screen, so one rename there strips the layout off all of them at once and
    // nothing throws.
    const { container } = render(
      <AuthProvider>
        <GuestManagerScreen activeEvent={EV} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />
      </AuthProvider>
    );
    expect(container.innerHTML).not.toContain('class="undefined"');
    expect(container.innerHTML).not.toContain("undefined ");
  });
});
