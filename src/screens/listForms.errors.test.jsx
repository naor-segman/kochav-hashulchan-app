// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../test/dom.js";
import TasksScreen from "./TasksScreen.jsx";
import VendorsScreen from "./VendorsScreen.jsx";

/* 136 stage D (31.10): an empty name on the tasks and vendors forms is said
 * under the field, which is marked and focused. It was a toast. */
describe.each([
  ["tasks",   TasksScreen,   /משימה/, "מה צריך לעשות", "שם המשימה לא יכול להיות ריק"],
  ["vendors", VendorsScreen, /ספק/,   "שם הספק",       "שם הספק לא יכול להיות ריק"],
])("%s — an empty name", (_, Screen, openName, label, message) => {
  it("is said under the field, not in a toast, and goes when typing", () => {
    const patchEvent = vi.fn(), showToast = vi.fn();
    render(<Screen activeEvent={{ id: "e1", tasks: [], vendors: [] }} patchEvent={patchEvent} go={vi.fn()} showToast={showToast} />);
    fireEvent.click(screen.getAllByRole("button", { name: openName })[0]);
    const input = screen.getByLabelText(label, { exact: false });
    fireEvent.click(screen.getByRole("button", { name: /^(הוסיפו|שמרו)$/ }));
    expect(patchEvent).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), "err");
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "x" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
