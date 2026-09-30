// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ShareGateDialog from "../share/ShareGate.jsx";

/* Fourth review 30.9: focus went into every dialog and never came back — after
 * Escape, "ביטול" or confirming, a keyboard user was left on <body>. */

function Opener({ Dialog }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>פתחו</button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}
const Confirm = (p) => <ConfirmDialog message="למחוק?" confirmLabel="מחיקה" {...p} />;
const Share = (p) => <ShareGateDialog what="whatsapp" {...p} />;

describe("focus returns to the opener when a dialog closes", () => {
  for (const [name, Dialog] of [["ConfirmDialog", Confirm], ["ShareGate", Share]]) {
    it(`${name}: Escape`, () => {
      render(<MemoryRouter><Opener Dialog={Dialog} /></MemoryRouter>);
      const opener = screen.getByRole("button", { name: "פתחו" });
      opener.focus();
      fireEvent.click(opener);
      expect(document.activeElement).not.toBe(opener);     // focus went into the dialog
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.activeElement).toBe(opener);
    });
  }
});
