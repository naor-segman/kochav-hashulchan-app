// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../../test/dom.js";

/* Checklist 103 (1.10): a guest hands over a name, a phone, a photo — and is
 * told, right there, where it goes (§11 of the Privacy Protection Law). Rendered
 * on the real screens, with the real form, as a guest reaches it. */
vi.mock("../../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי" }),
  fetchAlbumPhotos: async () => [],
}));
const { default: RSVPScreen }  = await import("../../screens/RSVPScreen.jsx");
const { default: GiftScreen }  = await import("../../screens/GiftScreen.jsx");
const { default: AlbumScreen } = await import("../../screens/AlbumScreen.jsx");

const at = (path, route, el) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path={route} element={el} /></Routes></MemoryRouter>);
const noteLink = () => screen.getAllByRole("link", { name: "מדיניות הפרטיות" })
  .filter(a => a.getAttribute("href") === "/privacy#guests");

describe("the privacy note on the guest forms", () => {
  it("RSVP — under the 'yes' form", async () => {
    at("/rsvp/tok12345", "/rsvp/:token", <RSVPScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /כן, אגיע בשמחה/ }));
    await screen.findByLabelText("כמה מגיעים?");
    expect(noteLink()).toHaveLength(1);
    expect(screen.getByText(/מסירת הפרטים רשות/)).toBeTruthy();
  });

  it("gift page — and says the amount is shown to nobody else", async () => {
    at("/gift/tok12345", "/gift/:token", <GiftScreen />);
    await screen.findByLabelText(/שמכם המלא/);
    expect(noteLink()).toHaveLength(1);
    expect(screen.getByText(/הסכום לא מוצג לאף אחד אחר/)).toBeTruthy();
  });

  it("album — and says the photos are seen by everyone with the link", async () => {
    at("/album/tok12345", "/album/:token", <AlbumScreen />);
    await act(async () => {});
    expect(await screen.findByText(/גלויים לכל מי שיש לו את הקישור לאלבום/)).toBeTruthy();
    expect(noteLink()).toHaveLength(1);
  });
});
