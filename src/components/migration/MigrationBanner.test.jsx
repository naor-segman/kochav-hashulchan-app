// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test/dom.js";
import MigrationBanner from "./MigrationBanner.jsx";
import { MIGRATION_STATUS } from "../../hooks/useMigration.js";
import styles from "./MigrationBanner.module.css";

/**
 * This banner is the UI for a ONE-WAY operation: press the wrong button and
 * local events are pushed into an account, and there is no undo.
 *
 * It is a four-branch lookup on a string constant, which is the exact SHAPE of
 * bug class 1 — a key that stops matching does not throw, it falls through to
 * the default branch. Here the default branch is the idle prompt, so a status
 * rename means a migration that is ALREADY RUNNING renders as "press this to
 * start", with a live "ייבאו אירועים" button under the host's thumb. Nothing in
 * the type system, the linter or a screenshot catches that.
 */

const migration = (over = {}) => ({
  status: MIGRATION_STATUS.IDLE,
  progress: { done: 0, total: 0 },
  error: null,
  migrate: vi.fn(),
  dismiss: vi.fn(),
  unsyncedCount: 3,
  ...over,
});

describe("MigrationBanner", () => {
  it("shows progress while migrating and offers NO way to start it again", () => {
    render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.MIGRATING,
      progress: { done: 2, total: 5 },
    })} />);

    expect(screen.getByText("מייבא אירועים לחשבון…")).toBeInTheDocument();
    expect(screen.getByText("2 מתוך 5")).toBeInTheDocument();
    // The fall-through symptom, asserted directly: no start button may exist.
    expect(screen.queryByText("ייבאו אירועים ←")).toBeNull();
    expect(screen.queryByText("דלגו לעכשיו")).toBeNull();
  });

  it("counts progress as a fraction, not a bare number", () => {
    // "3" alone in an RTL line is bug class 7 waiting to happen. `X מתוך Y`
    // carries a strong Hebrew character between the numerals, which is what
    // anchors the visual order.
    render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.MIGRATING,
      progress: { done: 3, total: 4 },
    })} />);
    const track = document.querySelector("." + styles.progressFill);
    expect(track.style.width).toBe("75%");
  });

  it("does not divide by zero before the total is known", () => {
    // migrate() sets MIGRATING and only then computes the list, so the banner
    // renders at least once with total: 0. NaN% is an invalid CSS width and the
    // bar disappears entirely.
    render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.MIGRATING,
      progress: { done: 0, total: 0 },
    })} />);
    expect(document.querySelector("." + styles.progressFill).style.width).toBe("0%");
  });

  it("uses Hebrew singular for one event and plural for several", () => {
    const one = render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.SUCCESS, progress: { done: 1, total: 1 },
    })} />);
    expect(screen.getByText(/אירוע יובא/)).toBeInTheDocument();
    one.unmount();

    render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.SUCCESS, progress: { done: 4, total: 4 },
    })} />);
    expect(screen.getByText(/אירועים יובאו/)).toBeInTheDocument();
  });

  it("says 'אירוע מקומי אחד' for one unsynced event, not '1 אירועים'", () => {
    render(<MigrationBanner migration={migration({ unsyncedCount: 1 })} />);
    expect(screen.getByText(/אירוע מקומי אחד/)).toBeInTheDocument();
    expect(screen.queryByText(/1 אירועים/)).toBeNull();
  });

  it("offers retry AND skip after a failure, and shows the reason", () => {
    // A failed one-way migration that only offers "try again" traps a host
    // whose account genuinely cannot take the rows.
    const m = migration({ status: MIGRATION_STATUS.FAILED, error: "אין חיבור לשרת" });
    render(<MigrationBanner migration={m} />);

    expect(screen.getByText("הייבוא נכשל")).toBeInTheDocument();
    expect(screen.getByText("אין חיבור לשרת")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByText("נסו שוב"));
    expect(m.migrate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("דלגו"));
    expect(m.dismiss).toHaveBeenCalledTimes(1);
  });

  it("wires the idle prompt's two buttons to the two DIFFERENT callbacks", () => {
    // Swapping these is a one-line edit that runs an irreversible migration on
    // a host who pressed "skip".
    const m = migration();
    render(<MigrationBanner migration={m} />);

    fireEvent.click(screen.getByText("דלגו לעכשיו"));
    expect(m.dismiss).toHaveBeenCalledTimes(1);
    expect(m.migrate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("ייבאו אירועים ←"));
    expect(m.migrate).toHaveBeenCalledTimes(1);
    expect(m.dismiss).toHaveBeenCalledTimes(1);
  });

  it("gives each state its own real CSS Modules class", () => {
    // Bug class 9, and here it is semantic: `.bannerError` is what makes a
    // failure look like a failure. Losing it renders the failure in the neutral
    // idle skin, so a host scrolls past a migration that did not happen.
    const fail = render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.FAILED, error: "x",
    })} />);
    expect(styles.bannerError).toBeTypeOf("string");
    expect(screen.getByRole("alert").className.split(" ")).toContain(styles.bannerError);
    expect(screen.getByRole("alert").className).not.toContain("undefined");
    fail.unmount();

    render(<MigrationBanner migration={migration({
      status: MIGRATION_STATUS.SUCCESS, progress: { done: 1, total: 1 },
    })} />);
    expect(styles.bannerSuccess).toBeTypeOf("string");
    expect(screen.getByRole("status").className.split(" ")).toContain(styles.bannerSuccess);
  });
});
