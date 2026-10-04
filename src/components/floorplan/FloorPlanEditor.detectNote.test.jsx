// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "../../test/dom.js";

/* Audit 3.10, C24: "זיהוי שולחנות אוטומטי" sends the sketch to an outside AI
 * service (Anthropic, through the detect-floor-plan function), and the editor
 * said so nowhere — only the privacy policy did. The line under the toolbar
 * says it where the choice is made, in the policy's own terms. */

vi.mock("../../hooks/usePlan.js", () => ({ usePlan: () => ({ plan: "free", limits: {} }) }));
vi.mock("../../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const { default: FloorPlanEditor } = await import("./FloorPlanEditor.jsx");

const EV = { id: "e1", name: "e", guests: [], tables: [], seating: {},
  floorPlan: { image: "data:image/jpeg;base64,AAAA", tablePositions: {} } };

describe("sketch detection discloses where the image goes (C24)", () => {
  it("the editor names the outside service next to the detect button", () => {
    render(<FloorPlanEditor ev={EV} patchEvent={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole("button", { name: /זיהוי שולחנות אוטומטי/ })).toBeInTheDocument();
    const note = screen.getByText(/התמונה נשלחת לניתוח בשירות AI חיצוני \(Anthropic\) ולא נשמרת אצלנו/);
    expect(note.querySelector('a[href="/privacy"]')).not.toBeNull();
  });

  it("says what the privacy policy says — Anthropic, sent for analysis, not kept by us", () => {
    const privacy = readFileSync(join(process.cwd(), "src/screens/PrivacyScreen.jsx"), "utf8");
    expect(privacy).toMatch(/<strong>Anthropic<\/strong> — ניתוח תמונת סקיצה של האולם/);
    expect(privacy).toMatch(/התמונה נשלחת לניתוח \(ראו סעיף 6\) ולא נשמרת אצלנו/);
  });
});
