import { describe, it, expect } from "vitest";
import { readFunctionFailure, functionFailureMessage } from "./functionError.js";

// The floor-plan detector failed for days while the host was shown "Edge
// Function returned a non-2xx status code" and the function's own log said
// `Anthropic API error: 401 … invalid x-api-key`. These pin that the message
// crosses the wire.

/** What supabase-js hands back for a non-2xx: a generic message + the Response. */
const httpError = (status, body) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => body },
});

describe("readFunctionFailure", () => {
  it("returns null when nothing went wrong", async () => {
    expect(await readFunctionFailure(null, { tables: [1, 2] })).toBeNull();
    expect(await readFunctionFailure(undefined, undefined)).toBeNull();
  });

  it("digs the function's OWN error out of the response body", async () => {
    const f = await readFunctionFailure(httpError(502, { error: "Anthropic API returned 401" }));
    expect(f.code).toBe("Anthropic API returned 401");
    expect(f.status).toBe(502);
    expect(functionFailureMessage(f)).toBe("Anthropic API returned 401");
  });

  it("makes the rate-limit branch reachable at all", async () => {
    // The server answers 429, which is a non-2xx, so it lands in `error` and
    // `data` is null — a `data?.error === "rate_limited"` check could never
    // have run, and the host got a raw toast instead of "try again in an hour".
    const f = await readFunctionFailure(httpError(429, {
      error: "rate_limited", note: "יותר מדי בקשות זיהוי. נסו שוב בעוד שעה.",
    }));
    expect(f.code).toBe("rate_limited");
    expect(functionFailureMessage(f)).toBe("יותר מדי בקשות זיהוי. נסו שוב בעוד שעה.");
  });

  it("falls back to the transport message when there is no usable body", async () => {
    for (const ctx of [
      { status: 500, json: async () => { throw new Error("not json"); } },
      { status: 500, json: async () => null },
      { status: 500, json: async () => ({}) },
      undefined,
    ]) {
      const f = await readFunctionFailure({ message: "Edge Function returned a non-2xx status code", context: ctx });
      expect(f.code).toBe("Edge Function returned a non-2xx status code");
    }
  });

  it("survives an error that is not an Error at all", async () => {
    const f = await readFunctionFailure("משהו נשבר");
    expect(f.code).toBe("משהו נשבר");
    expect(f.status).toBeNull();
  });

  it("still reads an error field returned WITH a 2xx", async () => {
    const f = await readFunctionFailure(null, { error: "no_tables", note: "לא זוהו שולחנות" });
    expect(f.code).toBe("no_tables");
    expect(functionFailureMessage(f)).toBe("לא זוהו שולחנות");
  });

  // A hall past ~55 tables overran max_tokens, came back as cut-off JSON, and
  // reached the host as "Could not parse detection result" — which sends them
  // looking at their photo when the answer simply did not fit. The function now
  // reports the real reason, and it only arrives if the body is read: 422 is a
  // non-2xx, so `data` is null and only `error.context` carries it.
  it("surfaces a hall that is too big as its own reason, not as a bad image", async () => {
    const f = await readFunctionFailure(httpError(422, {
      error: "too_many_tables",
      note: "האולם גדול מכדי לזהות אותו בבת אחת. אפשר לצלם אותו בחלקים ולזהות כל חלק בנפרד.",
    }));
    expect(f.code).toBe("too_many_tables");
    expect(f.status).toBe(422);
    expect(functionFailureMessage(f)).toContain("לצלם אותו בחלקים");
  });

  it("never returns an empty sentence to show somebody", async () => {
    expect(functionFailureMessage(await readFunctionFailure(httpError(500, { error: "" })))).toBeTruthy();
    expect(functionFailureMessage(null)).toBe("");
  });
});
