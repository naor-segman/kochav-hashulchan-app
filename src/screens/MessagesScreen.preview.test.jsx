// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, fireEvent } from "../test/dom.js";

// WORKPLAN 108: the message preview showed the TEMPLATE — "היי {{שם}} 👋" —
// so the host read placeholders where a guest's name would be, and could not
// see what a guest actually receives. It is now the message itself, filled for
// a real guest of that stage by the same function that builds what is sent.

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const MessagesScreen = (await import("./MessagesScreen.jsx")).default;

const EVENT = {
  id: "e1", name: "החתונה של דנה ויוסי", date: "2027-06-01", venue: "אולמי הגן",
  guests: [
    { id: "g0", name: "שרה כהן", rsvp: "declined", phone: "0501111111" },
    { id: "g1", name: "טל שוורץ", rsvp: "pending", phone: "0501234567" },
  ],
  tables: [], seating: {},
};

function preview(ev) {
  const { container } = render(
    <MemoryRouter><MessagesScreen activeEvent={ev} patchEvent={() => {}} showToast={() => {}} /></MemoryRouter>,
  );
  const box = container.querySelector("[class*='preview']:not([class*='previewFor'])");
  const caption = container.querySelector("[class*='previewFor']");
  return { text: box?.textContent || "", caption: caption?.textContent || "" };
}

describe("MessagesScreen — the preview is the message, not the template", () => {
  it("fills the open stage for a guest it goes to", () => {
    const { text, caption } = preview(EVENT);
    expect(text).toContain("היי טל שוורץ");
    expect(text).toContain("לחתונה של דנה ויוסי");
    expect(text).toContain("אולמי הגן");
    expect(text).not.toMatch(/\{\{|\}\}/);
    // A declined guest is not in this stage's audience, so not the sample.
    expect(caption).toBe("כך ההודעה תיראה אצל טל שוורץ:");
  });

  it("with no guest yet, says what goes in the name slot", () => {
    const { text, caption } = preview({ ...EVENT, guests: [] });
    expect(text).toContain("היי שם האורח");
    expect(text).not.toMatch(/\{\{|\}\}/);
    expect(caption).toBe("כך ההודעה תיראה אצל שם האורח:");
  });

  it("never names a guest outside the stage — the reminder is not previewed for someone who declined (29.9 review)", () => {
    const ev = { ...EVENT, guests: [{ id: "g0", name: "שרה כהן", rsvp: "declined", phone: "0501111111" },
                                   { id: "g1", name: "טל שוורץ", rsvp: "confirmed", phone: "0501234567" }] };
    const { container } = render(
      <MemoryRouter><MessagesScreen activeEvent={ev} patchEvent={() => {}} showToast={() => {}} /></MemoryRouter>,
    );
    // Open the first reminder (pending only): nobody here is pending.
    const head = [...container.querySelectorAll("button")].find(b => b.textContent.includes("תזכורת ראשונה"));
    fireEvent.click(head);
    const captions = [...container.querySelectorAll("[class*='previewFor']")].map(c => c.textContent);
    expect(captions.some(c => c.includes("שרה כהן"))).toBe(false);
    expect(captions.some(c => c.includes("שם האורח"))).toBe(true);
  });
});
