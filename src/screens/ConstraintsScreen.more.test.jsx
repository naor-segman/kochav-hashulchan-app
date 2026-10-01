// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import ConstraintsScreen from "./ConstraintsScreen.jsx";

/* WORKPLAN 111 (1.10): the guest search showed ten names and stopped — a host
 * with 15 "כהן"s never saw the one they wanted, and nothing said there were more. */
const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה",
  guests: Array.from({ length: 15 }, (_, i) => ({ id: "g" + i, name: `כהן ${i + 1}`, side: "bride" })) });
const open = () => {
  render(<MemoryRouter><ConstraintsScreen activeEvent={ev} patchEvent={() => {}} go={() => {}} showToast={() => {}} /></MemoryRouter>);
  const input = screen.getAllByRole("textbox", { name: "אורח א׳" })[0];
  fireEvent.focus(input);
  return input;
};

describe("guest search in constraints", () => {
  it("says how many more there are past ten", () => {
    const input = open();
    fireEvent.change(input, { target: { value: "כהן" } });
    expect(screen.getAllByRole("option")).toHaveLength(10);
    expect(screen.getByText(/ועוד 5 — הקלידו עוד אותיות כדי לצמצם/)).toBeTruthy();
  });
  it("no hint when everything fits", () => {
    const input = open();
    fireEvent.change(input, { target: { value: "כהן 1" } });   // כהן 1, 10–15 → 7
    expect(screen.queryByText(/ועוד/)).toBeNull();
  });
});
