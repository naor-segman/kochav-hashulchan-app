// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "../test/dom.js";
import VendorsScreen from "./VendorsScreen.jsx";

/**
 * A vendor's status could not be changed after it was added (3.10, found by
 * the tour's copy review). The edit form shows a "סטטוס" select, but saving
 * dropped it — an earlier fix stopped writing back the status snapshotted when
 * the editor opened, because that silently reverted a "✓ סגור" pressed on the
 * row while editing. It threw away the host's own change along with it, and
 * still toasted "הספק עודכן ✓". Both cases are pinned here.
 */

const VENDOR = { id: "v1", name: "צלם", category: "photo", status: "lead", contact: "", phone: "",
                 price: "6000", paid: "", payment: "none", note: "" };

function Harness({ onState }) {
  const [ev, setEv] = useState({ id: "e1", vendors: [VENDOR] });
  const patchEvent = fn => setEv(prev => { const next = fn(prev); onState(next); return next; });
  return <VendorsScreen activeEvent={ev} patchEvent={patchEvent} showToast={vi.fn()} />;
}

const mount = () => {
  let last = null;
  render(<Harness onState={s => { last = s; }} />);
  return () => last;
};

describe("VendorsScreen — editing a vendor's status", () => {
  it("a status chosen in the edit form is saved", () => {
    const state = mount();
    fireEvent.click(screen.getByRole("button", { name: "עריכה" }));
    fireEvent.change(screen.getByLabelText("סטטוס"), { target: { value: "declined" } });
    fireEvent.click(screen.getByRole("button", { name: /שמרו/ }));
    expect(state().vendors[0].status).toBe("declined");
  });

  it("a ✓ סגור pressed on the row while editing is not reverted by saving", () => {
    const state = mount();
    fireEvent.click(screen.getByRole("button", { name: "עריכה" }));
    // The row's own button — the status filter above has a "סגור" chip too.
    fireEvent.click(document.querySelector('[class*="actBtn"]'));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "צלם אירועים" } });
    fireEvent.click(screen.getByRole("button", { name: /שמרו/ }));
    expect(state().vendors[0]).toMatchObject({ name: "צלם אירועים", status: "booked" });
  });
});
