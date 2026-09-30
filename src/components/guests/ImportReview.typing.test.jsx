// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "../../test/dom.js";
import ImportReview from "./ImportReview.jsx";
import { buildImportRows, readyImportRows } from "../../utils/importReview.js";

/* Fifth review 30.9, measured in a browser: typing "יובל סגמן" into the names
 * box stored "יובלסגמן"; clearing the seats box to type 12 cut the names and
 * then read "112". */

const store = { rows: null };   // what the screen last handed back
function Harness() {
  const [rows, setRows] = useState(() => buildImportRows([{ name: "משפחת כהן", phone: "0501234567", count: 3, companions: ["דנה", "רון"] }]));
  const onChange = (next) => { store.rows = next; setRows(next); };
  return <ImportReview rows={rows} existingGuests={[]} onChange={onChange} onConfirm={() => {}} onCancel={() => {}} />;
}
const type = (el, v) => fireEvent.change(el, { target: { value: v } });

describe("the review step keeps what the host types", () => {
  it("a space typed in a companion's name stays", () => {
    render(<Harness />);
    const names = screen.getByDisplayValue("דנה, רון");
    // Keystroke by keystroke, each appended to what the box shows — as a
    // browser does.
    for (const ch of ", יובל סגמן") type(names, names.value + ch);
    expect(names.value).toBe("דנה, רון, יובל סגמן");
    expect(readyImportRows(store.rows)[0].companions).toEqual(["דנה", "רון", "יובל סגמן"]);
  });

  it("clearing the seats to type 12 keeps the names, and reads 12", () => {
    render(<Harness />);
    const seats = screen.getByDisplayValue("3");
    type(seats, "");
    type(seats, "1");
    type(seats, "12");
    fireEvent.blur(seats);
    expect(seats.value).toBe("12");
    expect(store.rows[0].count).toBe(12);
    expect(store.rows[0].companions).toEqual(["דנה", "רון"]);
  });
});
