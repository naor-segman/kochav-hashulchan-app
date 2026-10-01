// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "../test/dom.js";
import { renderTemplate, stageByKey } from "../data/messageSequence.js";

/* צ — the personal entry card (the QR the door scans) reached guests only
 * through the seating screen's WhatsApp list, which showed FIVE guests and
 * pointed to the Excel file for the rest — a file with no card in it. Now:
 * a {{כרטיס}} placeholder (in the arrival-details stage by default), a card
 * column in the export, and the full list on the seating screen. */

const sheets = [];
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: rows => ({ __rows: rows }),
    book_append_sheet: (wb, ws, name) => { sheets.push({ name, rows: ws.__rows }); },
  },
  writeFile: () => {},
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const { exportToExcel } = await import("./exportHelpers.js");
const SeatingScreen = (await import("../screens/SeatingScreen.jsx")).default;

beforeEach(() => { sheets.length = 0; });

const O = "https://example.test";
const guests = [...Array(8)].map((_, i) => ({ id: "g" + i, name: "אורח " + i, side: "bride", count: 1, rsvp: "confirmed", phone: "05012345" + (10 + i) }));
const EV = {
  id: "e1", name: "החתונה", type: "חתונה", date: "2027-06-01",
  guests, tables: [{ id: "t1", name: "שולחן 1", capacity: 10, type: "regular" }],
  seating: Object.fromEntries(guests.map(g => [g.id, "t1"])),
  constraints: [], lockedGuests: [], lockedTables: [],
  tokens: { invite: "inv12345" },
};

describe("{{כרטיס}}", () => {
  it("fills the guest's own card, labelled", () => {
    const out = renderTemplate("היי {{שם}}\n{{כרטיס}}\nביי", { guest: { name: "דנה" }, card: O + "/card/inv12345?g=g1" });
    expect(out).toContain("כרטיס הכניסה האישי שלכם (הציגו בכניסה): https://example.test/card/inv12345?g=g1");
  });
  it("with no card the line leaves", () => {
    expect(renderTemplate("היי {{שם}}\n{{כרטיס}}\nביי", { guest: { name: "דנה" } })).toBe("היי דנה\nביי");
  });
  it("the arrival-details stage carries it", () => {
    expect(stageByKey("details").body).toContain("{{כרטיס}}");
  });
});

describe("Excel: a card column", () => {
  const sheet = (n) => sheets.find(s => s.name === n).rows;
  it("one URL per guest on the seating sheet, built on the invitation token", async () => {
    await exportToExcel(EV, () => "כלה", [], [], O);
    const rows = sheet("סידור הושבה");
    const head = rows.find(r => r[0] === "שולחן");
    const c = head.indexOf("כרטיס כניסה");
    expect(c).toBeGreaterThan(-1);
    const r0 = rows.find(r => r[4] === "אורח 0");
    expect(r0[c]).toMatch(/^https:\/\/example\.test\/card\/inv12345\?g=g0&/);
  });
  it("no invitation token: no empty column", async () => {
    await exportToExcel({ ...EV, tokens: {} }, () => "כלה", [], [], O);
    expect(sheet("סידור הושבה").find(r => r[0] === "שולחן")).not.toContain("כרטיס כניסה");
  });
});

describe("messages screen: the details stage carries each guest's card", () => {
  it("the preview shows the sample guest's own card URL", async () => {
    const MessagesScreen = (await import("../screens/MessagesScreen.jsx")).default;
    const { container, getByText } = render(
      <MemoryRouter><MessagesScreen activeEvent={EV} patchEvent={() => {}} showToast={() => {}} /></MemoryRouter>,
    );
    getByText("פרטי הגעה").closest("button").click();
    await Promise.resolve();
    const preview = [...container.querySelectorAll("[class*='preview']")].map(e => e.textContent).join(" ");
    expect(preview).toMatch(/כרטיס הכניסה האישי שלכם \(הציגו בכניסה\): http[^ ]*\/card\/inv12345\?g=g0/);
  });
});

describe("seating screen: every guest, not five", () => {
  it("lists all 8 seated guests with a phone", () => {
    const { container } = render(
      <MemoryRouter><SeatingScreen activeEvent={EV} patchEvent={() => {}} go={() => {}} showToast={() => {}} /></MemoryRouter>,
    );
    expect(container.querySelectorAll("[class*='waNotifyItem']").length).toBe(8);
    expect(container.textContent).not.toMatch(/ייצאו לאקסל לרשימה מלאה/);
  });
});
