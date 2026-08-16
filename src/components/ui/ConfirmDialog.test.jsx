// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "../../test/dom.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

// This dialog is the last thing a customer sees before an irreversible action,
// and it used to accept props it did not understand and render nothing for
// them — silently. The "delete local data" dialog passed its warning as `body`,
// which is not a prop; the sentence about permanent deletion never appeared,
// and the dialog asked for confirmation of a destructive action showing only
// its headline and two buttons.
//
// Nothing failed. That is the whole problem: a typo in an option name and a
// deliberately-written warning are indistinguishable from each other at
// runtime. These pin the signal that makes them distinguishable.

describe("ConfirmDialog — an option it cannot honour is not silently dropped", () => {
  let warn;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it("warns, naming the prop it is ignoring", () => {
    render(<ConfirmDialog message="למחוק?" body="זה בלתי הפיך" onClose={() => {}} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("body");
  });

  it("names every one of them, not just the first", () => {
    render(<ConfirmDialog message="למחוק?" body="x" title="y" onConfirm={() => {}} onClose={() => {}} />);
    const msg = warn.mock.calls[0][0];
    for (const p of ["body", "title", "onConfirm"]) expect(msg, p).toContain(p);
  });

  it("says where multi-line text actually goes, so the warning is actionable", () => {
    render(<ConfirmDialog message="למחוק?" body="x" onClose={() => {}} />);
    expect(warn.mock.calls[0][0]).toContain("message");
  });

  it("stays quiet for the props it does understand", () => {
    render(
      <ConfirmDialog
        mode="prompt"
        message="שם הקבוצה"
        danger
        confirmLabel="מחקו"
        cancelLabel="ביטול"
        placeholder="למשל: משפחה"
        defaultValue="חברים"
        onClose={() => {}}
      />
    );
    expect(warn).not.toHaveBeenCalled();
  });

  // The warning must never be the thing that breaks the dialog in front of a
  // customer, so it renders exactly as before either way.
  it("still renders the dialog when it warns", () => {
    render(<ConfirmDialog message="למחוק את האירוע?" body="x" onClose={() => {}} />);
    expect(screen.getByText("למחוק את האירוע?")).toBeTruthy();
    expect(screen.getByText("ביטול")).toBeTruthy();
  });

  // The behaviour the incident's caller actually wanted, pinned so nobody
  // "fixes" the warning by adding a `body` prop instead.
  it("renders multi-line message text, which is what `body` was reaching for", () => {
    render(<ConfirmDialog message={"למחוק?\nזו פעולה בלתי הפיכה"} onClose={() => {}} />);
    expect(screen.getByText("למחוק?")).toBeTruthy();
    expect(screen.getByText("זו פעולה בלתי הפיכה")).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });
});
