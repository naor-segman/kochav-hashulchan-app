// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import HostPreviewGate from "./HostPreviewGate.jsx";
import { SYNC_STATUS } from "../../utils/cloudSync.js";

/* audit 3.10, V1. A signed-in host opening /events/:id/preview-site (or
 * preview-announce) on a full page load was sent to /app: until the session
 * resolves, `events` is the logged-out bucket and the event is not in it. */

const at = (props) => render(
  <MemoryRouter initialEntries={["/events/e1/preview-site"]}>
    <Routes>
      <Route path="/events/:eventId/preview-site" element={
        <HostPreviewGate eventId="e1" syncStatus={SYNC_STATUS.LOCAL_ONLY} {...props}>
          {ev => <p>PREVIEW {ev.name}</p>}
        </HostPreviewGate>} />
      <Route path="/app" element={<p>DASHBOARD</p>} />
    </Routes>
  </MemoryRouter>,
);

describe("HostPreviewGate", () => {
  it("waits, rather than bouncing, while the account's events are not loaded yet", () => {
    at({ events: [], ready: false });
    expect(screen.queryByText("DASHBOARD")).toBeNull();
    expect(screen.getByText("טוענים את האירוע…")).toBeInTheDocument();
  });

  it("waits while the cloud pull is in flight", () => {
    at({ events: [], ready: true, syncStatus: SYNC_STATUS.SYNCING });
    expect(screen.queryByText("DASHBOARD")).toBeNull();
  });

  it("renders the preview once the event is there", () => {
    at({ events: [{ id: "e1", name: "חתונה" }], ready: true });
    expect(screen.getByText("PREVIEW חתונה")).toBeInTheDocument();
  });

  it("goes to the dashboard only when loading finished and the event is not the host's", () => {
    at({ events: [{ id: "other" }], ready: true });
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("both preview routes in App.jsx hand it the same ready flag as EventRoutes", () => {
    const app = readFileSync("src/App.jsx", "utf8");
    for (const name of ["EventSitePreview", "AnnouncementPreview"]) {
      expect(app).toMatch(new RegExp(`<${name} events=\\{events\\} ready=\\{!authLoading && eventsReady\\} syncStatus=\\{syncStatus\\} />`));
    }
  });
});
