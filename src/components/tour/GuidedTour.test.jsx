// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "../../test/dom.js";
import GuidedTour from "./GuidedTour.jsx";

// The tour measures in a frame callback; run frames immediately.
vi.stubGlobal("requestAnimationFrame", (f) => { f(); return 1; });
vi.stubGlobal("cancelAnimationFrame", () => {});
Element.prototype.scrollIntoView = () => {};

const STEPS = [
  { title: "פתיחה", text: "סיור קצר" },
  { target: "a", title: "חלק א", text: "זה א" },
  { target: "missing", title: "לא קיים", text: "אין כזה חלק בעמוד" },
  { target: "b", title: "חלק ב", text: "זה ב", done: "סיימתי" },
];

let page;
function mount(onClose = vi.fn()) {
  page = document.createElement("div");
  page.innerHTML = '<div data-tour="a">A</div><div data-tour="b">B</div><button>מחקו</button>';
  document.body.appendChild(page);
  const view = render(<GuidedTour steps={STEPS} onClose={onClose} />);
  return { ...view, onClose, page };
}
// Only what the test added: the tour is portalled to <body>, and clearing the
// whole body pulls its node out from under React.
afterEach(() => { page?.remove(); page = null; });

describe("GuidedTour", () => {
  it("skips a step whose part is not on the page, and counts without it", () => {
    mount();
    expect(screen.getByText("1 מתוך 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("הבא"));
    fireEvent.click(screen.getByText("הבא"));
    expect(screen.getByRole("heading", { name: "חלק ב" })).toBeInTheDocument();
    expect(screen.queryByText("לא קיים")).toBeNull();
  });

  it("the last step's button finishes with its own label", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByText("הבא"));
    fireEvent.click(screen.getByText("הבא"));
    fireEvent.click(screen.getByText("סיימתי"));
    expect(onClose).toHaveBeenCalledWith("done");
  });

  it("right-to-left keys: ArrowLeft forward, ArrowRight back, Escape skips", () => {
    const { onClose } = mount();
    act(() => { fireEvent.keyDown(document, { key: "ArrowLeft" }); });
    expect(screen.getByText("2 מתוך 3")).toBeInTheDocument();
    act(() => { fireEvent.keyDown(document, { key: "ArrowRight" }); });
    expect(screen.getByText("1 מתוך 3")).toBeInTheDocument();
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(onClose).toHaveBeenCalledWith("skipped");
  });

  it("is a labelled modal dialog, and says which part it is lighting", () => {
    mount();
    fireEvent.click(screen.getByText("הבא"));
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(dlg).toHaveAccessibleName("חלק א");
    expect(dlg).toHaveAccessibleDescription("זה א");
    expect(dlg.dataset.target).toBe("a");
  });

  it("no back button on the first step; one on every later step", () => {
    mount();
    expect(screen.queryByText("הקודם")).toBeNull();
    fireEvent.click(screen.getByText("הבא"));
    expect(screen.getByText("הקודם")).toBeInTheDocument();
  });

  it("makes the page inert while open — keyboard and screen reader cannot reach it — and gives it back", () => {
    // A review agent tabbed out of the card, opened a delete confirm hidden
    // under the scrim and deleted a guest (3.10). Only the mouse was blocked.
    const { unmount } = mount();
    expect(page.inert).toBe(true);
    const tourRoot = screen.getByRole("dialog").parentElement;
    expect(tourRoot.inert).not.toBe(true);
    unmount();
    expect(page.inert).not.toBe(true);
  });

  it("Tab from outside the card (focus on <body>) lands in the card, not on the page", () => {
    mount();
    document.activeElement?.blur();
    act(() => { fireEvent.keyDown(document, { key: "Tab" }); });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    act(() => { fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("leaves Alt+arrow to the browser (Back), and Ctrl/Meta combinations too", () => {
    mount();
    act(() => { fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true }); });
    expect(screen.getByText("1 מתוך 3")).toBeInTheDocument();
  });

  it("announces each new step to a screen reader", () => {
    mount();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByText("הבא"));
    expect(live.textContent).toBe("2 מתוך 3. חלק א. זה א");
  });
});
