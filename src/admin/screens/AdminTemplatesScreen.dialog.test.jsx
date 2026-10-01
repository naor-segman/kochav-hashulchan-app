// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../../test/dom.js";

/* AX8. The template form was a modal in name only: no role, no aria-modal,
 * Escape did nothing, focus stayed on the button behind the overlay and Tab
 * walked out into the table. */
function builder() {
  const b = {
    select: () => b, order: () => b,
    then: (res, rej) => Promise.resolve({ data: [
      { id: "t1", name: "חתונה קלאסית", type: "חתונה", sort_order: 0, is_active: true, created_at: "2026-09-01T00:00:00Z" },
    ], error: null }).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
vi.mock("../../utils/templateHelpers.js", () => ({ invalidateTemplateCache: () => {} }));
const { default: AdminTemplatesScreen } = await import("./AdminTemplatesScreen.jsx");

async function openForm() {
  render(<MemoryRouter><AdminTemplatesScreen /></MemoryRouter>);
  await screen.findByText("חתונה קלאסית");
  const opener = screen.getByRole("button", { name: /תבנית חדשה/ });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("admin templates — the form is a real modal dialog", () => {
  it("is a named, modal dialog", async () => {
    await openForm();
    const dlg = screen.getByRole("dialog", { name: "תבנית חדשה" });
    expect(dlg.getAttribute("aria-modal")).toBe("true");
  });

  it("moves focus into the form, to the name field", async () => {
    await openForm();
    await waitFor(() => expect(document.activeElement?.id).toBe("tpl-name"));
  });

  it("keeps Tab inside the dialog", async () => {
    await openForm();
    const dlg = screen.getByRole("dialog");
    const save = screen.getByRole("button", { name: "צור תבנית" });
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(save);
    const first = dlg.querySelector("button");
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it("Escape closes it and focus goes back to the opener", async () => {
    const opener = await openForm();
    await waitFor(() => expect(document.activeElement?.id).toBe("tpl-name"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
