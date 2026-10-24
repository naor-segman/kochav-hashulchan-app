// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import RootGate from "./RootGate.jsx";

// Checklist 3 (17.8): "/" sends a signed-in host into the app — the one part
// of that fix that was never checked, because there is no session here.
const at = (props) => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<RootGate {...props}><p>דף הבית</p></RootGate>} />
      <Route path="/app" element={<p>האירועים שלי</p>} />
    </Routes>
  </MemoryRouter>
);

describe("RootGate — what \"/\" shows", () => {
  it("a visitor gets the landing page", () => {
    at({ user: null, loading: false });
    expect(screen.getByText("דף הבית")).toBeTruthy();
  });
  it("a signed-in host goes straight to the app", () => {
    at({ user: { id: "u1" }, loading: false });
    expect(screen.getByText("האירועים שלי")).toBeTruthy();
    expect(screen.queryByText("דף הבית")).toBeNull();
  });
  it("while the session is read, neither — no landing-page flash", () => {
    at({ user: null, loading: true });
    expect(screen.queryByText("דף הבית")).toBeNull();
    expect(screen.queryByText("האירועים שלי")).toBeNull();
  });
});
