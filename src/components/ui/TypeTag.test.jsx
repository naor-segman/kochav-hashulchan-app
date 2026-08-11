// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "../../test/dom.js";
import TypeTag from "./TypeTag.jsx";
import styles from "./TypeTag.module.css";
import { TABLE_TYPES } from "../../data/constants.js";

/**
 * TypeTag is two of this repo's named bug classes in nine lines of JSX.
 *
 *   • Bug class 4 — "accent used as text". `--accent` measures 3.80:1 and is a
 *     FILL token. TypeTag writes its colour into an INLINE style that lands on
 *     text, which the file's own comment calls "the one place it could slip
 *     through" — CSS review catches the stylesheet, nobody greps JSX for it.
 *   • Bug class 1 — English keys vs stored Hebrew strings. The map is keyed by
 *     the English `value`s in TABLE_TYPES; a custom type is a Hebrew string the
 *     host typed. Falling through must show that string, not "?".
 *   • Bug class 9 — CSS Modules failing silently.
 */

describe("TypeTag", () => {
  it("renders VIP in --accent-text, never the fill-only --accent", () => {
    // The regression this pins is one character wide: `var(--accent)` instead
    // of `var(--accent-text)` renders identically in a screenshot and fails
    // contrast on white. It has to be asserted, it cannot be eyeballed.
    render(<TypeTag type="vip" />);
    const el = screen.getByText("VIP");
    expect(el.style.color).toBe("var(--accent-text)");
    expect(el.style.borderColor).toBe("var(--accent-text)");
    expect(el.style.color).not.toBe("var(--accent)");
  });

  it("maps every English TABLE_TYPES key to its own Hebrew label", () => {
    // constants.js owns the stored values; TypeTag owns the labels. The two
    // drift by a rename in one file, and the symptom is a tag reading "?" —
    // or, worse, the raw English key sitting mid-Hebrew table.
    for (const { value, label } of TABLE_TYPES) {
      const { unmount } = render(<TypeTag type={value} />);
      const el = screen.getByText(label);
      expect(el.textContent).toBe(label);
      expect(el.textContent).not.toBe(value);
      unmount();
    }
  });

  it("shows a custom Hebrew type as the host typed it, not as '?'", () => {
    // A host who names a table type "שולחן ההורים" stored that Hebrew string.
    // A lookup that only knows English keys renders "?" and the host cannot
    // tell their own tables apart.
    render(<TypeTag type="שולחן ההורים" />);
    expect(screen.getByText("שולחן ההורים")).toBeInTheDocument();
    expect(screen.queryByText("?")).toBeNull();
  });

  it("falls back to '?' only when there is genuinely no type", () => {
    render(<TypeTag type={undefined} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("carries a real CSS Modules class, not the string 'undefined'", () => {
    // Bug class 9: rename `.typeTag` in the stylesheet and `styles.typeTag`
    // becomes undefined, React writes class="undefined", the tag loses its
    // border and padding, and nothing anywhere throws.
    expect(styles.typeTag).toBeTypeOf("string");
    render(<TypeTag type="bar" />);
    const el = screen.getByText("בר");
    expect(el.className).toBe(styles.typeTag);
    expect(el.className).not.toContain("undefined");
  });
});
