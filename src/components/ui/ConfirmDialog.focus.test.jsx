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

/* Fifth review 30.9 (סב88): two ways it still landed on <body>. */
describe("focus does not fall to <body>", () => {
  it("a backdrop press does not take focus off the page before the dialog closes", () => {
    render(<MemoryRouter><Opener Dialog={Confirm} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "פתחו" }));
    const overlay = screen.getByRole("alertdialog").parentElement;
    // fireEvent returns false when the default (moving focus to <body>) was prevented
    expect(fireEvent.mouseDown(overlay)).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a confirmed delete: focus goes to the row that took the deleted one's place", async () => {
    function List() {
      const [rows, setRows] = useState(["א", "ב", "ג"]);
      const [asking, setAsking] = useState(null);
      return (
        <>
          <ul>{rows.map(r => <li key={r}><button onClick={() => setAsking(r)}>{`מחיקת ${r}`}</button></li>)}</ul>
          {asking && <ConfirmDialog message="למחוק?" confirmLabel="מחיקה" onClose={(ok) => {
            const r = asking;
            setAsking(null);
            // the caller awaits the answer, THEN deletes — after the dialog is gone
            if (ok) Promise.resolve().then(() => setRows(rs => rs.filter(x => x !== r)));
          }} />}
        </>
      );
    }
    render(<List />);
    const opener = screen.getByRole("button", { name: "מחיקת ב" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "מחיקה" }));
    await new Promise(r => setTimeout(r, 350));
    expect(screen.queryByRole("button", { name: "מחיקת ב" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "מחיקת ג" }));
  });

  it("the only item in its column: focus climbs to the nearest control still there (sixth review)", async () => {
    function Board() {
      const [rows, setRows] = useState(["א"]);
      const [asking, setAsking] = useState(null);
      return (
        <section>
          <button>הוספת משימה</button>
          <div className="column"><ul>{rows.map(r => <li key={r}><button onClick={() => setAsking(r)}>{`מחיקת ${r}`}</button></li>)}</ul></div>
          {asking && <ConfirmDialog message="למחוק?" confirmLabel="מחיקה" onClose={(ok) => {
            const r = asking;
            setAsking(null);
            if (ok) Promise.resolve().then(() => setRows(rs => rs.filter(x => x !== r)));
          }} />}
        </section>
      );
    }
    render(<Board />);
    const opener = screen.getByRole("button", { name: "מחיקת א" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "מחיקה" }));
    await new Promise(r => setTimeout(r, 350));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "הוספת משימה" }));
  });
});
