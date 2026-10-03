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

describe("the support address, now that the domain is bought", () => {
  // Since 3.10 (WORKPLAN 128): plansupport@ for support and plan@ for the main
  // business address, on Unica's domain — the site itself is a subdomain of it.
  // (Before: revaya-events.co.il, registered 31.8, with a real support@.)
  // not a forward. Until then every "צרו קשר" in the product dropped a
  // customer's question into a hole; these three assertions are what says that
  // is over, and they fail the moment COMPANY.domain is emptied again.
  it("every address is on the domain we actually own", () => {
    expect(supportEmail()).toBe("plansupport@unica-events.co.il");
    expect(contactEmail()).toBe("plan@unica-events.co.il");
    expect(supportMailto()).toBe("mailto:plansupport@unica-events.co.il");
  });

  it("says out loud that somebody is reading it", () => {
    expect(supportContactIsReal()).toBe(true);
  });

  it("still falls back rather than rendering a blank mailto: if the domain is cleared", () => {
    // The fallback is not dead code just because the domain is set — clearing
    // it is one keystroke, and a blank `mailto:` renders as a link that opens
    // an empty compose window addressed to nobody.
    COMPANY.domain = "";
    expect(supportEmail()).toBe("plansupport@kochav-hashulchan.co.il");
    expect(supportContactIsReal()).toBe(false);
  });
});

describe("and the two ways to turn it real", () => {
  it("one line in COMPANY.domain moves every address at once", () => {
    COMPANY.domain = "kochav.co.il";
    expect(supportEmail()).toBe("plansupport@kochav.co.il");
    expect(contactEmail()).toBe("plan@kochav.co.il");
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
    expect(contactEmail()).toBe("plan@kochav.co.il");
  });
});

describe("supportMailto encodes once, at the point of use", () => {
  // The account screen carried 200 characters of hand-written %D7%9E to say
  // a hand-escaped `משוב על …`. Unreadable, and it froze the brand name into an
  // escape sequence where COMPANY.name could never reach it.
  it("encodes a Hebrew subject and body", () => {
    const subject = `משוב על ${COMPANY.name}`;
    const url = supportMailto(subject, "שלום,\n\nרעיון:");
    expect(url.startsWith(`mailto:${supportEmail()}?`)).toBe(true);
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

describe("messageSignature — the credit line on every guest message", () => {
  it("is the credit and a link to the site we own — one line", () => {
    const sig = messageSignature();
    // Reads the brand from its source, so a rename does not break it.
    expect(sig).toBe(`\n\n— נבנה עם ${COMPANY.name} · https://plan.unica-events.co.il`);
  });

  it("no sales question in a message the host sends to their guests (103, §30א)", () => {
    COMPANY.whatsapp = "972501234567";
    const sig = messageSignature();
    expect(sig).not.toMatch(/רוצים|\?/);
    expect(sig.trim().split("\n")).toHaveLength(1);
  });

  it("is the credit alone while no site is configured — never a broken link", () => {
    COMPANY.site = "";
    const sig = messageSignature();
    expect(sig).toContain(`נבנה עם ${COMPANY.name}`);
    expect(sig).not.toContain("http");
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

  /* Comments are stripped before scanning.
   *
   * This has bitten twice: an assertion that reads raw source matches the
   * comment that EXPLAINS the rule, so documenting "this used to be a
   * `mailto:`" fails the test that forbids hand-built mailto: links. The
   * finding is then a bug in the check, not in the code, and the fix is here.
   *
   * `(?<!:)` keeps `https://` out of it — that colon is why a naive line-comment
   * strip eats every URL in the file. */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/[^\n]*/g, "");

  const scan = (re) => walk(SRC)
    .filter(f => !f.endsWith("data/company.js") && !f.endsWith("data/company.test.js"))
    .filter(f => re.test(stripComments(readFileSync(f, "utf8"))))
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

/* The rename of 3.10 (WORKPLAN 128): "Unica Plan", English only.
 *
 * The second rename the comment above predicted. Three things it can get wrong
 * without anything else failing:
 *   • a Hebrew form creeping back — the owner's decision is that there is none;
 *   • a Hebrew prefix letter glued to the Latin name: "נבנה בUnica Plan". With
 *     a Hebrew brand "ב{name}" was correct, and three screens did exactly that;
 *     with a Latin one it needs a maqaf ("ב-Unica Plan") or a rephrase;
 *   • the old name or domain left in the files that are not JSX — the shell's
 *     <title>, the installed app's name, robots.txt, the auth email templates,
 *     the checkout description. None of them goes through COMPANY.name. */
describe("the brand is Unica Plan — English only (3.10)", () => {
  const ROOT = new URL("../../", import.meta.url).pathname;
  const SRC = join(ROOT, "src");
  const walk = (dir) => readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : /\.(jsx?)$/.test(e) && !/\.test\./.test(e) ? [f] : [];
  });
  const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");

  it("the name, the site and the two mailboxes", () => {
    expect(COMPANY.name).toBe("Unica Plan");
    expect(COMPANY.name, "no Hebrew form of the name").not.toMatch(/[\u0590-\u05FF]/);
    expect(COMPANY.site).toBe("https://plan.unica-events.co.il");
    expect(COMPANY.host).toBe("plan.unica-events.co.il");
    expect(supportEmail()).toBe("plansupport@unica-events.co.il");
    expect(contactEmail()).toBe("plan@unica-events.co.il");
  });

  it("no Hebrew prefix letter glued to the name — ב-Unica Plan, not בUnica Plan", () => {
    const glued = walk(SRC).filter(f => /[\u05D0-\u05EA]\$?\{COMPANY\.name/.test(code(f)))
      .map(f => f.slice(SRC.length + 1));
    expect(glued).toEqual([]);
  });

  it("the old name and domain are gone from the files that do not read COMPANY", () => {
    const files = ["index.html", "vite.config.js", "public/robots.txt",
      "supabase/email-templates/confirm-signup.html", "supabase/email-templates/reset-password.html",
      "supabase/functions/create-checkout-session/index.ts"];
    const left = files.filter(f => /רוויה|רְוָיָה|revaya|REVAYA|כוכב השולחן/i.test(readFileSync(join(ROOT, f), "utf8")));
    expect(left).toEqual([]);
    for (const f of files.slice(0, 2)) expect(readFileSync(join(ROOT, f), "utf8"), f).toContain("Unica Plan");
  });
});
