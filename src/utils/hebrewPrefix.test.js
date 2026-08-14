import { describe, it, expect } from "vitest";
import { hasDefiniteArticle, prefixed } from "./hebrewPrefix.js";

// This rule lived inside messageSequence.js, reachable only from
// renderTemplate — while four other places built the same sentence with a raw
// `ל${name}` and shipped the doubled article to a guest. It is shared now, so
// these pin the behaviour both callers depend on.
describe("prefixed — the definite article an attached letter absorbs", () => {
  it("absorbs the article on the event-type nouns the app itself prefixes", () => {
    expect(prefixed("ל", "החתונה של דנה")).toBe("לחתונה של דנה");
    expect(prefixed("ב", "הברית של איתי")).toBe("בברית של איתי");
    expect(prefixed("ל", "האירוע שלנו")).toBe("לאירוע שלנו");
  });

  // The whole reason this is a whitelist and not `startsWith("ה")`: an event
  // called "הילה ואור" went out to every guest as "מוזמנים לילה ואור".
  it("never eats a ה that is part of the name", () => {
    expect(prefixed("ל", "הילה ואור")).toBe("להילה ואור");
    expect(prefixed("ל", "הדר ויונתן")).toBe("להדר ויונתן");
    expect(prefixed("ב", "היכל התרבות")).toBe("בהיכל התרבות");
    // The ה of הכנסה is a root letter, not an article.
    expect(prefixed("ל", "הכנסת ספר תורה")).toBe("להכנסת ספר תורה");
  });

  it("covers the nouns that were measured wrong before the move", () => {
    expect(prefixed("ל", "החגיגה של סבתא")).toBe("לחגיגה של סבתא");
    expect(prefixed("ל", "הכנס השנתי")).toBe("לכנס השנתי");
    expect(prefixed("ל", "הסעודה")).toBe("לסעודה");
    expect(prefixed("ל", "הרמת כוסית")).toBe("להרמת כוסית");
  });

  // A stranded "ל" on its own is worse than saying nothing, so callers can test
  // the result and fall back.
  it("returns an empty string rather than a lone prefix letter", () => {
    expect(prefixed("ל", "")).toBe("");
    expect(prefixed("ל", null)).toBe("");
    expect(prefixed("ל", "   ")).toBe("");
  });

  it("hasDefiniteArticle answers only about a real article", () => {
    expect(hasDefiniteArticle("החתונה")).toBe(true);
    expect(hasDefiniteArticle("הילה")).toBe(false);
    expect(hasDefiniteArticle("חתונה")).toBe(false);
    expect(hasDefiniteArticle("")).toBe(false);
  });
});
