import { describe, it, expect } from "vitest";
import { normPhone, respStatus, latestPerRespondent } from "./rsvpApply.js";

// Third-review mutation run (29.9): four edits to rsvpApply.js passed every
// test in the repo. Three are pinned here. The fourth — `>=` → `>` on the
// latest-answer timestamp — is NOT, because the test would have to encode the
// current tie-break as correct and it is not obviously so: fetchRSVPResponses
// returns rows NEWEST FIRST, so on a same-millisecond tie `>=` keeps the later
// row in the list, i.e. the OLDER answer. See the review report.

describe("normPhone: the international 00 prefix", () => {
  // A relative abroad types their number the way their own phone dials Israel:
  // 00972-50-… . Without stripping 00 it normalised to "00972501234567" and
  // never matched the host's "050-123-4567" — the answer landed as a stranger,
  // and the guest row stayed "לא ענה".
  it("00972 50 123 4567 → 0501234567, same as +972 and 050", () => {
    expect(normPhone("00972-50-123-4567")).toBe("0501234567");
    expect(normPhone("+972 50 123 4567")).toBe("0501234567");
    expect(normPhone("050-123-4567")).toBe("0501234567");
  });
});

describe("respStatus: a legacy row with only the boolean", () => {
  // Rows written before the `status` column carry `attending` alone. A decline
  // from that era read as "yes" would put a guest who said no into the head
  // count, the meal order and the shuttle list.
  it("attending false → no; attending true → yes; status wins when present", () => {
    expect(respStatus({ attending: false })).toBe("no");
    expect(respStatus({ attending: true })).toBe("yes");
    expect(respStatus({ status: "maybe", attending: true })).toBe("maybe");
  });
});

describe("latestPerRespondent: rows with neither phone nor name are not one person", () => {
  // The function's own contract: "Rows without either are kept as they are."
  // Keying them all to the same empty name collapsed every anonymous answer
  // into one — five blank "yes, 2 of us" rows counted as two people, not ten.
  it("two keyless rows both survive", () => {
    const rows = [
      { id: "a", guest_name: "", phone: "", status: "yes", created_at: "2026-09-01T10:00:00Z" },
      { id: "b", guest_name: "  ", phone: null, status: "yes", created_at: "2026-09-01T11:00:00Z" },
    ];
    expect(latestPerRespondent(rows).map(r => r.id)).toEqual(["a", "b"]);
  });
});
