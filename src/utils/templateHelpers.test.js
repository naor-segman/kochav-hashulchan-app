import { describe, it, expect, vi, beforeEach } from "vitest";

// A module-level cache with no tests is a quiet way to serve stale data for a
// whole session, and the mapper decides what the "create event" screen offers.
// A missing `type` here is not cosmetic: the rest of the app compares event
// type against the Hebrew strings in constants.js, so an empty one falls
// through to a wedding checklist on a bar mitzvah.
const from = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  supabase: { from: (...a) => from(...a) },
  isSupabaseConfigured: true,
}));

const {
  normalizeCloudTemplate, fetchActiveCloudTemplates,
  getTemplateCache, invalidateTemplateCache,
  LOCAL_MAIN_TEMPLATES, EMPTY_TEMPLATE,
} = await import("./templateHelpers.js");

// The query is a chain ending in two .order() calls; the last one resolves.
const respond = (result) => {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    order:  vi.fn(),
  };
  chain.order.mockReturnValueOnce(chain).mockResolvedValueOnce(result);
  from.mockReturnValue(chain);
};

beforeEach(() => {
  from.mockReset();
  invalidateTemplateCache();
});

describe("normalizeCloudTemplate", () => {
  it("maps a full row to the shape the picker renders", () => {
    expect(normalizeCloudTemplate({
      id: "t1", name: "חתונה קלאסית", type: "חתונה", icon: "💍", description: "תיאור",
    })).toEqual({ id: "t1", icon: "💍", label: "חתונה קלאסית", type: "חתונה", desc: "תיאור" });
  });

  it("defaults a missing type to the Hebrew 'חתונה', never an empty string", () => {
    const t = normalizeCloudTemplate({ id: "t1" });
    expect(t.type).toBe("חתונה");
    expect(t.icon).toBe("✦");
    expect(t.label).toBe("");
    expect(t.desc).toBe("");
  });

  it("treats an empty string as missing rather than passing it through", () => {
    expect(normalizeCloudTemplate({ id: "t1", type: "", icon: "", name: "" }).type).toBe("חתונה");
    expect(normalizeCloudTemplate({ id: "t1", type: "", icon: "" }).icon).toBe("✦");
  });

  it("drops the payload column — event creation reads only the type", () => {
    const t = normalizeCloudTemplate({ id: "t1", payload: { guests: [{ id: "g1" }] } });
    expect(t.payload).toBeUndefined();
    expect(Object.keys(t).sort()).toEqual(["desc", "icon", "id", "label", "type"]);
  });
});

describe("local template constants", () => {
  it("keeps 'start from scratch' out of the main list but available on its own", () => {
    expect(LOCAL_MAIN_TEMPLATES.some(t => t.id === "empty")).toBe(false);
    expect(EMPTY_TEMPLATE?.id).toBe("empty");
    expect(LOCAL_MAIN_TEMPLATES.length).toBeGreaterThan(0);
  });
});

describe("fetchActiveCloudTemplates", () => {
  it("returns normalized rows and caches them", async () => {
    respond({ data: [{ id: "t1", name: "חתונה", type: "חתונה" }], error: null });
    const first = await fetchActiveCloudTemplates();
    expect(first).toEqual([{ id: "t1", icon: "✦", label: "חתונה", type: "חתונה", desc: "" }]);
    expect(getTemplateCache()).toEqual(first);

    // Second call must not touch the network at all.
    from.mockReset();
    expect(await fetchActiveCloudTemplates()).toEqual(first);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null on an error, and does not poison the cache with it", async () => {
    respond({ data: null, error: { code: "42P01" } });
    expect(await fetchActiveCloudTemplates()).toBeNull();
    expect(getTemplateCache()).toBeNull();
  });

  it("returns null for an empty table so callers fall back to the local list", async () => {
    respond({ data: [], error: null });
    expect(await fetchActiveCloudTemplates()).toBeNull();
    expect(getTemplateCache()).toBeNull();
  });

  it("never throws, whatever the client does", async () => {
    from.mockImplementation(() => { throw new Error("network down"); });
    await expect(fetchActiveCloudTemplates()).resolves.toBeNull();
  });

  it("invalidating the cache makes the next call fetch again", async () => {
    respond({ data: [{ id: "t1", name: "א" }], error: null });
    await fetchActiveCloudTemplates();
    expect(getTemplateCache()).not.toBeNull();

    invalidateTemplateCache();
    expect(getTemplateCache()).toBeNull();

    respond({ data: [{ id: "t2", name: "ב" }], error: null });
    const second = await fetchActiveCloudTemplates();
    expect(second[0].id).toBe("t2");
  });
});
