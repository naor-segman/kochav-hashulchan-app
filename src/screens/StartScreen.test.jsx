// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../test/dom.js";
import StartScreen from "./StartScreen.jsx";
import { EVENT_TYPES } from "../data/constants.js";

/**
 * The very first screen, and the place bug class 1 does the most damage.
 *
 * Event type is stored as the HEBREW string from EVENT_TYPES. StartScreen
 * branches on it three ways — which fields it asks for, what it calls them, and
 * which name it builds — through getEventPersonalConfig. An English key
 * (`type === "wedding"`) matches nothing here and falls through to the generic
 * "owner" branch, which does not throw: it silently asks a bar mitzvah host for
 * "שם הגיבור/ה" and names their event "בר מצווה — עידו" instead of
 * "בר המצווה של עידו". CLAUDE.md records that three tests once encoded exactly
 * this fall-through as if it were correct behaviour, which is why every case
 * below asserts the Hebrew RESULT rather than the branch that produced it.
 *
 * The seed shape matters just as much: the fields differ per kind, and a seed
 * that carries the wrong key means the name the host typed is simply absent
 * from the stored event.
 */

const pickType = (value) =>
  fireEvent.change(screen.getByLabelText("סוג האירוע"), { target: { value } });

const typeInto = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("StartScreen — event type is a Hebrew string, not an English key", () => {
  it("offers every canonical EVENT_TYPES value as an option", () => {
    render(<StartScreen onStart={vi.fn()} />);
    const select = screen.getByLabelText("סוג האירוע");
    const values = [...select.querySelectorAll("option")].map(o => o.value);
    for (const t of EVENT_TYPES) expect(values).toContain(t);
    // And none of them is an English key that would never match a stored event.
    expect(values.every(v => !/^[a-z_]+$/.test(v))).toBe(true);
  });

  it("builds 'החתונה של דנה ויוסי' for a wedding and seeds bride + groom", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    typeInto("שם ראשון", "דנה");
    typeInto("שם שני", "יוסי");
    fireEvent.click(screen.getByText(/בואו נתחיל/));

    expect(onStart).toHaveBeenCalledTimes(1);
    const seed = onStart.mock.calls[0][0];
    expect(seed.type).toBe("חתונה");
    expect(seed.name).toBe("החתונה של דנה ויוסי");
    expect(seed.brideName).toBe("דנה");
    expect(seed.groomName).toBe("יוסי");
  });

  it("says האירוסין for אירוס and החינה for חינה — same 'wedding' kind, different words", () => {
    // All three share kind === "wedding", so a branch that keys off the KIND
    // alone names an engagement party "החתונה של…". The type string is what
    // separates them, and it is Hebrew.
    const first = render(<StartScreen onStart={vi.fn()} />);
    pickType("אירוס");
    typeInto("שם ראשון", "ליה");
    typeInto("שם שני", "אלון");
    expect(screen.getByText("האירוסין של ליה ואלון")).toBeInTheDocument();
    first.unmount();

    render(<StartScreen onStart={vi.fn()} />);
    pickType("חינה");
    typeInto("שם ראשון", "נועה");
    expect(screen.getByText("החינה של נועה")).toBeInTheDocument();
  });

  it("asks a bar mitzvah for ONE name, labelled in Hebrew, and seeds celebrantName", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    pickType("בר מצווה");

    // The second name field is gone — the generic fall-through would keep it.
    expect(screen.queryByLabelText("שם שני")).toBeNull();
    typeInto("שם הבר מצווה", "עידו");
    expect(screen.getByText("בר המצווה של עידו")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/בואו נתחיל/));
    const seed = onStart.mock.calls[0][0];
    expect(seed.type).toBe("בר מצווה");
    expect(seed.celebrantName).toBe("עידו");
    // The fall-through symptom: a generic seed key, and the name lost.
    expect(seed.ownerName).toBeUndefined();
    expect(seed.name).not.toBe("בר מצווה — עידו");
  });

  it("asks a corporate event for the ORGANISATION and seeds organizationName", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    pickType("אירוע עסקי");

    typeInto("שם הארגון", 'חברת כוכב בע"מ');
    fireEvent.click(screen.getByText(/בואו נתחיל/));
    const seed = onStart.mock.calls[0][0];
    expect(seed.type).toBe("אירוע עסקי");
    expect(seed.organizationName).toBe('חברת כוכב בע"מ');
    // A business event is named after itself — no "האירוע של" wrapper.
    expect(seed.name).toBe('חברת כוכב בע"מ');
  });

  it("keeps the CTA disabled until there is a name to derive one from", () => {
    // `ready` is derived from the built name, not from the raw input, so a type
    // whose derive rule returns "" must not let a nameless event through.
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    const cta = screen.getByText(/בואו נתחיל/).closest("button");
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onStart).not.toHaveBeenCalled();

    typeInto("שם ראשון", "דנה");
    expect(cta).not.toBeDisabled();
  });

  it("passes the date through untouched as the YYYY-MM-DD the input holds", () => {
    // Bug class 2. The moment this value goes through a Date it can land a day
    // earlier east of Greenwich. The screen's job is to not touch it at all.
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    typeInto("שם ראשון", "דנה");
    fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: "2027-06-01" } });
    fireEvent.click(screen.getByText(/בואו נתחיל/));
    expect(onStart.mock.calls[0][0].date).toBe("2027-06-01");
  });
});
