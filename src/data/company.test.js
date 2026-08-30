import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  COMPANY, supportEmail, contactEmail, supportContactIsReal, supportMailto, messageSignature,
} from "./company.js";

/* Two things this file holds.
 *
 * ONE — the support address had NINE hardcoded copies across EIGHT files, on a
 * domain nobody owns, so every "צרו קשר" in the product dropped a customer's
 * question into a hole. Two of the nine honoured VITE_SUPPORT_EMAIL and the
 * other seven ignored it, so setting that variable fixed a quarter of the
 * problem while looking like it had fixed all of it. There is one source now,
 * and the sweep at the bottom is what stops a tenth copy appearing.
 *
 * TWO — `messageSignature()` is the growth engine: it appends a line to every
 * WhatsApp message a guest receives, and it lights up on its own the moment a
 * contact is configured. It had no test at all, which for a function whose
 * whole job is "behave differently in three states" is the same as having no
 * idea which state it is in.
 */

// The module reads a mutable object on purpose, so a test can put it into the
// state the owner will put it into and read the answer back out.
const ORIGINAL = { ...COMPANY };
beforeEach(() => { vi.unstubAllEnvs(); Object.assign(COMPANY, ORIGINAL); });
afterEach(()  => { vi.unstubAllEnvs(); Object.assign(COMPANY, ORIGINAL); });

describe("the support address, before the domain is bought", () => {
  it("falls back to the placeholder rather than a blank mailto:", () => {
    expect(supportEmail()).toBe("support@kochav-hashulchan.co.il");
    expect(supportMailto()).toBe("mailto:support@kochav-hashulchan.co.il");
  });

  it("says out loud that nobody is reading it", () => {
    // This is the honest half. Nothing branches on it yet — it exists so the
    // decision to hide or replace those links can be made in ONE place when
    // the legal pages get their real contact details.
    expect(supportContactIsReal()).toBe(false);
  });
});

describe("and the two ways to turn it real", () => {
  it("one line in COMPANY.domain moves every address at once", () => {
    COMPANY.domain = "kochav.co.il";
    expect(supportEmail()).toBe("support@kochav.co.il");
    expect(contactEmail()).toBe("contact@kochav.co.il");
    expect(supportContactIsReal()).toBe(true);
  });

  it("or VITE_SUPPORT_EMAIL, with no code change at all", () => {
    vi.stubEnv("VITE_SUPPORT_EMAIL", "hello@example.com");
    expect(supportEmail()).toBe("hello@example.com");
    expect(supportContactIsReal()).toBe(true);
  });

  it("the env var wins over the domain — it is the more specific answer", () => {
    COMPANY.domain = "kochav.co.il";
    vi.stubEnv("VITE_SUPPORT_EMAIL", "hello@example.com");
    expect(supportEmail()).toBe("hello@example.com");
    // …and only for the mailbox it names. Sales is still on the domain.
    expect(contactEmail()).toBe("contact@kochav.co.il");
  });
});

describe("supportMailto encodes once, at the point of use", () => {
  // The account screen carried 200 characters of hand-written %D7%9E to say
  // a hand-escaped `משוב על …`. Unreadable, and it froze the brand name into an
  // escape sequence where COMPANY.name could never reach it.
  it("encodes a Hebrew subject and body", () => {
    const subject = `משוב על ${COMPANY.name}`;
    const url = supportMailto(subject, "שלום,\n\nרעיון:");
    expect(url.startsWith("mailto:support@kochav-hashulchan.co.il?")).toBe(true);
    expect(url).toContain("subject=" + encodeURIComponent(subject));
    expect(url).toContain("body=" + encodeURIComponent("שלום,\n\nרעיון:"));
  });

  it("does not double-encode", () => {
    // The failure mode of encoding twice is %25D7 — a literal percent sign
    // followed by the escape, which mail clients show as gibberish.
    expect(supportMailto("שלום")).not.toContain("%25");
  });

  it("omits the query entirely when there is nothing to put in it", () => {
    expect(supportMailto()).not.toContain("?");
    expect(supportMailto("", "")).not.toContain("?");
  });
});

describe("messageSignature — the growth line on every guest message", () => {
  it("is attribution only while nothing is configured", () => {
    const sig = messageSignature();
    // Reads the brand from its source. Hardcoding it here is what made this
    // assertion the only thing that broke when the name was decided — a test
    // that fails on a rename it is not guarding is a test that has to be
    // edited every time, and one that gets edited carelessly.
    expect(sig).toContain(`נבנה עם ${COMPANY.name}`);
    // No half-built call to action, and above all no broken link: this text
    // goes to somebody else's wedding guests.
    expect(sig).not.toContain("רוצים אתר");
    expect(sig).not.toContain("http");
    expect(sig).not.toContain("wa.me");
  });

  it("adds the site link once a site exists", () => {
    COMPANY.site = "https://kochav.co.il";
    expect(messageSignature()).toContain("רוצים אתר לאירוע שלכם? https://kochav.co.il");
  });

  it("prefers WhatsApp over the site — a reply beats a click", () => {
    COMPANY.site = "https://kochav.co.il";
    COMPANY.whatsapp = "972501234567";
    const sig = messageSignature();
    expect(sig).toContain("https://wa.me/972501234567");
    expect(sig, "both routes at once is two calls to action in one line")
      .not.toContain("https://kochav.co.il");
  });

  it("follows the brand name, which is not final", () => {
    COMPANY.name = "שם חדש";
    expect(messageSignature()).toContain("נבנה עם שם חדש");
  });

  it("starts on its own line so it never runs into the message", () => {
    expect(messageSignature().startsWith("\n\n— ")).toBe(true);
  });
});

describe("nobody has hardcoded the address again", () => {
  // The door test. Nine copies is what happens without one — and the two in
  // AccountScreen even had the env-var fallback, which made the other seven
  // look deliberate rather than forgotten.
  const SRC = new URL("../", import.meta.url).pathname;

  const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full)
      : /\.(jsx?|css)$/.test(entry) ? [full] : [];
  });

  it("scanned a real tree — an empty sweep would pass vacuously", () => {
    expect(walk(SRC).length).toBeGreaterThan(150);
  });

  /* One exemption, argued in the open rather than by a looser regex.
   *
   * `calendarFile.js` puts `@kochav-hashulchan` in an iCalendar UID. RFC 5545
   * UIDs are shaped like an addr-spec but they are IDENTIFIERS, not mailboxes —
   * nobody mails one. And they are load-bearing in the other direction: a
   * calendar client dedupes on UID, so changing the suffix would make every
   * "save the date" already in a guest's calendar re-appear as a second entry.
   * It stays exactly as it is. */
  const NOT_AN_ADDRESS = { "utils/calendarFile.js": "iCalendar UID, not a mailbox" };

  const scan = (re) => walk(SRC)
    .filter(f => !f.endsWith("data/company.js") && !f.endsWith("data/company.test.js"))
    .filter(f => re.test(readFileSync(f, "utf8")))
    .map(f => f.slice(SRC.length))
    .filter(f => !(f in NOT_AN_ADDRESS));

  it("no file outside company.js names an email domain of ours", () => {
    expect(scan(/(support|contact|hello|info)@kochav|mailto:[^$)\s]*kochav/),
      "route these through supportMailto() / contactMailto()").toEqual([]);
  });

  it("the exemption is real — remove the file and this must notice", () => {
    // An exemption list that names a file which no longer matches is an
    // exemption that has quietly become a hole for the next one.
    const raw = readFileSync(join(SRC, "utils/calendarFile.js"), "utf8");
    expect(raw).toContain("@kochav-hashulchan");
    expect(raw, "if this is ever a mailto:, the exemption is wrong").not.toContain("mailto:");
  });

  it("no file builds its own mailto: by hand", () => {
    // Concatenating one is how the encoding drifts and how a second address
    // appears. `supportMailto` / `contactMailto` are the only builders — a
    // CALL to them is fine, a template literal starting `mailto:` is not.
    expect(scan(/`mailto:|"mailto:|'mailto:/),
      "use supportMailto() / contactMailto()").toEqual([]);
  });

  /* The same door, for the brand.
   *
   * When the name was decided on 30.8 it had to be changed in THIRTY-FOUR
   * files, because every screen spelled it out. That is the support-address
   * bug again at six times the size, and the trademark search is not finished
   * — so a second rename is a live possibility, not a hypothetical.
   *
   * The literal is built from COMPANY.name rather than typed, so this test
   * keeps guarding whatever the brand becomes instead of guarding a string
   * that stops being the brand. */
  it("no file outside company.js spells the brand name out", () => {
    expect(scan(new RegExp(COMPANY.name)),
      "render {COMPANY.name} instead of typing the brand").toEqual([]);
  });
});
