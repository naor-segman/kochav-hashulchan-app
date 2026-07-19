// deno-lint-ignore-file no-explicit-any
// =============================================================================
// detect-floor-plan — Supabase Edge Function
//
// Uses the Anthropic API (vision) to analyze a venue floor plan image and
// detect how many tables exist and how many seats each one has.
//
// Request  (POST, JSON): { imageBase64: string, mimeType: string }
// Response (JSON):       { tables: [{ index, seats, x, y }], totalDetected, note? }
//
// Required Edge Function secret (set in Supabase Dashboard → Settings → Edge Functions):
//   ANTHROPIC_API_KEY — sk-ant-api03-…
//
// Deploy:
//   supabase functions deploy detect-floor-plan
// =============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const DETECTION_PROMPT = `You are analyzing a venue floor plan for an event seating management system.

Examine this floor plan image carefully and identify all tables/seating areas.
For each table you find, determine:
1. Its approximate center position as a PERCENTAGE of the total image dimensions
   (x = 0-100 from left to right, y = 0-100 from top to bottom)
2. The number of chairs or seats visible or implied around it
   (count chairs if visible; estimate from table size and type if not)

Return ONLY valid JSON — no explanations, no markdown, no code fences. Raw JSON only:
{
  "tables": [
    { "index": 1, "seats": 10, "x": 25.5, "y": 35.0 },
    { "index": 2, "seats": 8,  "x": 60.0, "y": 25.0 }
  ],
  "note": "optional brief note about confidence or image quality"
}

If no tables can be detected (image is unclear, not a floor plan, etc.):
{ "tables": [], "note": "explanation of why no tables were found" }`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY is not configured for this environment." }, 503);
  }

  try {
    const { imageBase64, mimeType } = await req.json() as { imageBase64: string; mimeType: string };

    if (!imageBase64 || !mimeType) {
      return json({ error: "imageBase64 and mimeType are required" }, 400);
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return json({ error: `Unsupported MIME type: ${mimeType}` }, 400);
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mimeType as any, data: imageBase64 },
            },
            { type: "text", text: DETECTION_PROMPT },
          ],
        }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errBody);
      return json({ error: `Anthropic API returned ${anthropicResponse.status}` }, 502);
    }

    const result = await anthropicResponse.json() as any;
    const rawText: string = result.content?.[0]?.text ?? "";

    let parsed: any;
    try {
      const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed on Anthropic response:", rawText);
      return json({ error: "Could not parse detection result", raw: rawText }, 502);
    }

    const tables: Array<{ index: number; seats: number; x: number; y: number }> =
      (parsed.tables ?? []).map((t: any, i: number) => ({
        index: t.index ?? i + 1,
        seats: Math.max(1, Math.round(Number(t.seats) || 8)),
        x:     Math.min(100, Math.max(0, Number(t.x)  || 50)),
        y:     Math.min(100, Math.max(0, Number(t.y)  || 50)),
      }));

    return json({ tables, totalDetected: tables.length, note: parsed.note ?? null });

  } catch (err: any) {
    console.error("detect-floor-plan error:", err?.message ?? err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
