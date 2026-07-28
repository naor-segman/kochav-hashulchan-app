import { describe, it, expect } from "vitest";
import {
  MESSAGE_STAGES, stageByKey, audienceFor, reachable,
  renderTemplate, whatsappLink, estimateCost, audienceLabel,
} from "./messageSequence.js";

const g = (id, extra = {}) => ({ id, name: id, phone: "0501234567", rsvp: "pending", ...extra });

describe("the sequence itself", () => {
  it("runs from save-the-date through to thanks", () => {
    expect(MESSAGE_STAGES.map(s => s.key)).toEqual([
      "saveTheDate", "invitation", "reminder1", "reminder2", "details", "thanks",
    ]);
  });
  it("every stage has a body, an audience and a lookup", () => {
    for (const s of MESSAGE_STAGES) {
      expect(s.body.trim()).not.toBe("");
      expect(audienceLabel(s.audience)).toBeTruthy();
      expect(stageByKey(s.key)).toBe(s);
    }
    expect(stageByKey("nope")).toBeNull();
  });
});

describe("audienceFor", () => {
  const guests = [
    g("pending"),
    g("confirmed", { rsvp: "confirmed" }),
    g("maybe",     { rsvp: "maybe" }),
    g("declined",  { rsvp: "declined" }),
    g("arrived",   { rsvp: "confirmed", arrived: true }),
  ];

  it("never messages someone who declined, whatever the stage", () => {
    for (const s of MESSAGE_STAGES) {
      expect(audienceFor(s, guests).map(x => x.id)).not.toContain("declined");
    }
  });

  it("reminders chase only the people who haven't answered", () => {
    const ids = audienceFor(stageByKey("reminder1"), guests).map(x => x.id);
    expect(ids).toEqual(expect.arrayContaining(["pending", "maybe"]));
    expect(ids).not.toContain("confirmed");
  });

  it("arrival details go only to those coming", () => {
    const ids = audienceFor(stageByKey("details"), guests).map(x => x.id);
    expect(ids).toEqual(expect.arrayContaining(["confirmed", "arrived"]));
    expect(ids).not.toContain("pending");
  });

  it("thanks go only to those who actually turned up", () => {
    expect(audienceFor(stageByKey("thanks"), guests).map(x => x.id)).toEqual(["arrived"]);
  });
});

describe("reachable", () => {
  it("keeps only guests with a usable number", () => {
    const ids = reachable([g("a"), g("b", { phone: "" }), g("c", { phone: "123" })]).map(x => x.id);
    expect(ids).toEqual(["a"]);
  });
});

describe("renderTemplate", () => {
  const ctx = {
    event: { name: "החתונה", date: "15 בספטמבר", venue: "אולמי הגן" },
    guest: { name: "טל" },
    table: { name: "7" },
    link:  "https://x.co/r",
  };

  it("fills every placeholder", () => {
    const out = renderTemplate("היי {{שם}}, {{אירוע}} ב{{תאריך}} ב{{מקום}}. {{שולחן}} {{קישור}}", ctx);
    expect(out).toContain("טל");
    expect(out).toContain("החתונה");
    expect(out).toContain("אולמי הגן");
    expect(out).toContain("השולחן שלכם: 7");
    expect(out).toContain("https://x.co/r");
  });

  // A prefix letter attached to a placeholder absorbs the definite article:
  // "מוזמנים ל" + "החתונה" is "לחתונה", never "להחתונה".
  it("elides the definite article after an attached prefix letter", () => {
    expect(renderTemplate("אתם מוזמנים ל{{אירוע}}!", ctx)).toBe("אתם מוזמנים לחתונה!");
    expect(renderTemplate("נתראה ב{{מקום}}", ctx)).toBe("נתראה באולמי הגן");
  });

  // The first version of this rule tested `startsWith("ה")`, which stripped the
  // ה from any name beginning with one — every guest of an event called
  // "הילה ואור" was invited to "לילה ואור".
  it("does NOT strip a ה that is part of the name itself", () => {
    const at = name => renderTemplate("אתם מוזמנים ל{{אירוע}}!", { ...ctx, event: { name } });
    expect(at("הילה ואור")).toBe("אתם מוזמנים להילה ואור!");
    expect(at("הדר ויונתן")).toBe("אתם מוזמנים להדר ויונתן!");
    expect(renderTemplate("נתראה ב{{מקום}}", { ...ctx, event: { venue: "היכל התרבות" } }))
      .toBe("נתראה בהיכל התרבות");
  });

  it("still elides when the ה really is the article on an event noun", () => {
    const at = name => renderTemplate("אתם מוזמנים ל{{אירוע}}!", { ...ctx, event: { name } });
    expect(at("החתונה של דנה ויוסי")).toBe("אתם מוזמנים לחתונה של דנה ויוסי!");
    expect(at("הבר מצווה של יונתן")).toBe("אתם מוזמנים לבר מצווה של יונתן!");
  });

  it("leaves a word that merely ends in a prefix letter alone", () => {
    // "של" ends in ל but is a separate word — the ה must survive.
    expect(renderTemplate("השם של {{אירוע}}", ctx)).toBe("השם של החתונה");
  });

  it("removes unknown placeholders rather than showing braces to a guest", () => {
    expect(renderTemplate("שלום {{נעלם}}", ctx)).toBe("שלום");
  });

  it("does not leave a stranded blank line where a placeholder was", () => {
    const out = renderTemplate("א\n\n{{שולחן}}\n\nב", { ...ctx, table: null });
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("tolerates a missing guest, table or link", () => {
    expect(() => renderTemplate("{{שם}} {{שולחן}} {{קישור}}", { event: {} })).not.toThrow();
  });
});

describe("whatsappLink", () => {
  it("converts local numbers to international", () => {
    expect(whatsappLink("050-123-4567", "hi")).toContain("wa.me/972501234567");
  });
  it("accepts an already-international number", () => {
    expect(whatsappLink("+972501234567", "hi")).toContain("wa.me/972501234567");
  });
  it("encodes the message text", () => {
    expect(whatsappLink("0501234567", "שלום עולם")).toContain("text=%D7%A9");
  });
  it("returns null for an unusable number", () => {
    expect(whatsappLink("", "hi")).toBeNull();
    expect(whatsappLink("123", "hi")).toBeNull();
    expect(whatsappLink(null, "hi")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("prices a full run so 'unlimited' can't hide the bill", () => {
    expect(estimateCost(2000)).toBe(240);
    expect(estimateCost(0)).toBe(0);
  });
  it("respects a different per-message rate", () => {
    expect(estimateCost(100, 0.2)).toBe(20);
  });
});
