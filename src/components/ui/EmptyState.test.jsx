// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "../../test/dom.js";
import EmptyState from "./EmptyState.jsx";

// 136 stage D: an empty screen may draw what will be there (the tables screen
// draws empty tables). The drawing is decoration — a screen reader hears the
// title and the sentence, not three anonymous SVGs — and it replaces the mark.
describe("EmptyState — the drawing", () => {
  it("renders the art hidden from assistive tech, instead of the mark", () => {
    const { container } = render(
      <EmptyState mark="tables" title="האולם עוד ריק" text="…" art={<svg data-x="art" />} />,
    );
    const art = container.querySelector("[data-x=art]");
    expect(art).not.toBeNull();
    expect(art.closest("[aria-hidden=true]")).not.toBeNull();
    expect(container.querySelectorAll("svg").length).toBe(1);
    expect(container.querySelector("h2").textContent).toBe("האולם עוד ריק");
  });

  it("falls back to the section mark without art", () => {
    const { container } = render(<EmptyState mark="tables" title="x" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
