// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "../test/dom.js";
import { MemoryRouter } from "react-router-dom";

/* The host's album screen — checklist 57 — measured on the rendered DOM.
 *
 * The things that matter, in order of what goes wrong if they break:
 *   1. It reads by the CLOUD id. `ev.id` is the local id; album_photos.event_id
 *      is events.id. Reading by the wrong one shows "no photos yet" over a full
 *      album, with no error anywhere.
 *   2. Delete is NOT optimistic. A photo that leaves the grid while its file is
 *      still on the internet is the one outcome this screen exists to prevent.
 *   3. Hide IS optimistic, and a failed hide puts the photo back.
 *   4. The screen says that hiding does not take a photo off the internet.
 */

const fetchHostAlbumPhotos = vi.fn();
const setAlbumPhotoHidden  = vi.fn();
const deleteAlbumPhoto     = vi.fn();
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostAlbumPhotos: (...a) => fetchHostAlbumPhotos(...a),
  setAlbumPhotoHidden:  (...a) => setAlbumPhotoHidden(...a),
  deleteAlbumPhoto:     (...a) => deleteAlbumPhoto(...a),
}));

// The confirm dialog is its own component with its own tests; here it answers
// "yes" so the delete path runs.
let confirmAnswer = true;
// The upload link goes through the share gate, which reads the account.
let currentUser = { id: "u1" };
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user: currentUser, loading: false }) }));

vi.mock("../components/ui/useConfirm.jsx", () => ({
  useConfirm: () => ({ confirm: async () => confirmAnswer, dialog: null }),
}));

const AlbumManagerScreen = (await import("./AlbumManagerScreen.jsx")).default;

/* The "מוסתרת" TAG on a tile — by exact text, never by searching the page.
   The first version of these tests asserted `body.textContent` contains /
   does not contain "מוסתרת", and the privacy note on this screen ("תמונה
   מוסתרת יורדת מהאלבום…") contains that word. So two assertions passed on a
   page with no tag at all, and the rollback test failed on a page that had
   rolled back correctly. The check was wrong three times, the code none. */
const hiddenTags = () => screen.queryAllByText("מוסתרת", { exact: true });

const EV = { id: "local-1", cloudId: "cloud-1", name: "חתונה" };
const photo = (id, extra = {}) => ({
  id, storagePath: `cloud-1/${id}.jpg`, uploader: `אורח ${id}`,
  createdAt: "2026-09-27T20:00:00Z", hidden: false, url: `https://x/${id}.jpg`, ...extra,
});

let toast;
const renderScreen = (ev = EV) =>
  render(<AlbumManagerScreen activeEvent={ev} showToast={toast} go={() => {}} />);

beforeEach(() => {
  currentUser = { id: "u1" };
  fetchHostAlbumPhotos.mockReset();
  setAlbumPhotoHidden.mockReset();
  deleteAlbumPhoto.mockReset();
  confirmAnswer = true;
  toast = vi.fn();
});

describe("AlbumManagerScreen — reading the album", () => {
  it("reads by the CLOUD id, never the local one", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(fetchHostAlbumPhotos).toHaveBeenCalled());
    expect(fetchHostAlbumPhotos).toHaveBeenCalledWith("cloud-1");
    expect(fetchHostAlbumPhotos).not.toHaveBeenCalledWith("local-1");
  });

  it("says the event is not in the cloud yet, rather than 'no photos'", () => {
    // An empty grid here would be a false statement about an album that may be
    // full — the photos are keyed to a cloud id this event does not have.
    renderScreen({ id: "local-1", cloudId: null });
    expect(fetchHostAlbumPhotos).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("עוד לא נשמר בענן");
    expect(document.body.textContent).not.toContain("עוד אין תמונות");
  });

  it("an empty album's button is labelled and goes to the guest links", async () => {
    // EmptyState takes action={{ label, onClick }}. This screen handed it a
    // whole <button> element, so EmptyState rendered a button with no label
    // and no handler — an empty, dead box under "עוד אין תמונות".
    fetchHostAlbumPhotos.mockResolvedValue([]);
    const go = vi.fn();
    render(<AlbumManagerScreen activeEvent={EV} showToast={toast} go={go} />);
    const btn = await screen.findByRole("button", { name: "לקישורים לאורחים" });
    fireEvent.click(btn);
    expect(go).toHaveBeenCalledWith("share");
  });

  it("shows every photo, hidden ones included and labelled in words", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a"), photo("b", { hidden: true })]);
    renderScreen();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    // The host must see a hidden photo to be able to un-hide it.
    expect(hiddenTags()).toHaveLength(1);
  });

  it("tells the host that hiding does not take a photo off the internet", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    expect(document.body.textContent).toMatch(/הקישור הישיר/);
    expect(document.body.textContent).toMatch(/מחקו/);
  });

  it("says so when the album cannot be loaded", async () => {
    fetchHostAlbumPhotos.mockRejectedValue(new Error("offline"));
    renderScreen();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

describe("AlbumManagerScreen — hide", () => {
  it("hides at once and keeps it hidden when the server agrees", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    setAlbumPhotoHidden.mockResolvedValue(true);
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /הסתרה מהאלבום/ }));
    expect(setAlbumPhotoHidden).toHaveBeenCalledWith("a", true);
    await waitFor(() => expect(hiddenTags()).toHaveLength(1));
  });

  it("puts the photo back when the hide fails", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    setAlbumPhotoHidden.mockRejectedValue(new Error("denied"));
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /הסתרה מהאלבום/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining("לא הצלחנו"), "err"));
    expect(hiddenTags()).toHaveLength(0);
  });
});

describe("AlbumManagerScreen — delete", () => {
  it("removes the tile only AFTER the file is gone", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a"), photo("b")]);
    let finish;
    deleteAlbumPhoto.mockReturnValue(new Promise(r => { finish = r; }));
    renderScreen();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: /מחיקה/ })[0]);
    await waitFor(() => expect(deleteAlbumPhoto).toHaveBeenCalled());
    // Still in flight: the tile must still be there.
    expect(screen.getAllByRole("img")).toHaveLength(2);
    finish(true);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
  });

  it("keeps the photo on screen when the delete fails, and says it was NOT deleted", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    deleteAlbumPhoto.mockRejectedValue(new Error("storage down"));
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /מחיקה/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining("לא נמחקה"), "err"));
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("does nothing when the host backs out of the confirm", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    confirmAnswer = false;
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /מחיקה/ }));
    await new Promise(r => setTimeout(r, 20));
    expect(deleteAlbumPhoto).not.toHaveBeenCalled();
  });

  it("hands the delete the storage path, so the FILE can go first", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([photo("a")]);
    deleteAlbumPhoto.mockResolvedValue(true);
    renderScreen();
    await waitFor(() => screen.getAllByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: /מחיקה/ }));
    await waitFor(() => expect(deleteAlbumPhoto).toHaveBeenCalled());
    expect(deleteAlbumPhoto.mock.calls[0][0]).toMatchObject({ id: "a", storagePath: "cloud-1/a.jpg" });
  });
});

/* Owner, 3.10: the guests' upload link sat in the site editor's "עיצוב האתר"
 * card. It now opens the album's own screen, with copy and a QR. */
describe("AlbumManagerScreen — the upload link lives here", () => {
  const WITH_TOKEN = { ...EV, tokens: { album: "albtok123" } };

  it("shows the album's upload link with copy and QR", async () => {
    fetchHostAlbumPhotos.mockResolvedValue([]);
    render(<AlbumManagerScreen activeEvent={WITH_TOKEN} showToast={toast} go={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "הקישור לאלבום המשותף" });
    expect(input.value).toBe(window.location.origin + "/album/albtok123");
    expect(screen.getByRole("button", { name: "העתיקו" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "קוד QR" })).toBeInTheDocument();
  });

  it("without an account, copy explains instead of copying a link that will not open", async () => {
    currentUser = null;
    fetchHostAlbumPhotos.mockResolvedValue([]);
    render(<MemoryRouter><AlbumManagerScreen activeEvent={WITH_TOKEN} showToast={toast} go={() => {}} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "העתיקו" }));
    expect(screen.getByText(/כדי לשתף צריך חשבון/)).toBeInTheDocument();
  });
});
