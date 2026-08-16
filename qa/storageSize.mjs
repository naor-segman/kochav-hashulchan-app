// How much localStorage one real event actually costs.
//
// The open question is whether gallery photos have to move to Supabase Storage,
// and it has been carried as "~2.52MB, Safari caps around 5MB" — an estimate
// nobody re-derived. A decision that trades a day of work against a customer
// losing their guest list deserves a measured number, per field, so the answer
// can be "move the photos" or "cap the gallery at N" rather than a guess.
//
// So: build events at real sizes, serialise them exactly as the app does, and
// report the bytes — split into what is structural (guests, tables, seating)
// and what is images.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

// A JPEG data URL of roughly the size the app produces after its client-side
// compression. Built from a repeating pattern rather than a real photo so the
// harness carries no binary, and padded to the target byte count — base64 of a
// compressed photo is incompressible, so length is what matters here, not
// entropy.
const photo = (kb) => "data:image/jpeg;base64," + "/9j/4AAQSkZJRgABAQAAAQABAAD".repeat(Math.ceil(kb * 1024 / 27));

const HEB = "אבגדהוזחטיכלמנסעפצקרשת";
const name = (i) => `${HEB[i % HEB.length]}${HEB[(i * 7) % HEB.length]}${HEB[(i * 3) % HEB.length]} ` +
                    `${HEB[(i * 5) % HEB.length]}${HEB[(i * 11) % HEB.length]}${HEB[(i * 2) % HEB.length]}${HEB[(i * 13) % HEB.length]}`;

function buildEvent({ guests, tables, gallery, galleryKb, floorPlanKb }) {
  const g = Array.from({ length: guests }, (_, i) => ({
    id: `g${i}`, name: name(i), side: i % 2 ? "bride" : "groom",
    group: ["משפחה", "חברים", "עבודה", "משפחה רחוקה"][i % 4],
    count: (i % 5) + 1, phone: `05${(10000000 + i * 7919) % 90000000}`,
    rsvp: ["confirmed", "pending", "declined"][i % 3],
    companions: Array.from({ length: i % 5 }, (_, j) => name(i * 3 + j)),
    note: i % 6 === 0 ? "צמחוני, ללא גלוטן" : "",
    arrivedSeats: i % 4 === 0 ? [0, 1] : undefined,
    estGift: i % 3 === 0 ? 500 : 0,
  }));
  const t = Array.from({ length: tables }, (_, i) => ({
    id: `t${i}`, name: `שולחן ${i + 1}`, capacity: 12, type: "regular", shape: "round",
  }));
  const seating = {};
  g.forEach((x, i) => { if (i % 10 !== 0) seating[x.id] = `t${i % tables}`; });

  return {
    id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2027-06-01",
    venue: "אולמי הגן הקסום ברחובות", brideName: "דנה", groomName: "יוסי",
    guests: g, tables: t, seating,
    constraints: Array.from({ length: Math.floor(guests / 20) }, (_, i) => ({
      id: `c${i}`, type: i % 2 ? "together" : "apart", guestA: `g${i}`, guestB: `g${i + 1}`,
    })),
    tasks: Array.from({ length: 25 }, (_, i) => ({ id: `k${i}`, title: `משימה ${i}`, done: i % 3 === 0, offset: i })),
    vendors: Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, name: `ספק ${i}`, category: "צילום", phone: "0501111111", price: 8000 })),
    costs: { categories: Array.from({ length: 14 }, (_, i) => ({ id: `cat${i}`, name: `קטגוריה ${i}`, budget: 10000, actual: 9000 })) },
    messagesSent: Object.fromEntries(["save-the-date", "invite", "reminder"].map(k =>
      [k, Object.fromEntries(g.slice(0, Math.floor(guests * 0.8)).map(x => [x.id, 1755300000000]))])),
    eventSite: {
      gallery: Array.from({ length: gallery }, () => photo(galleryKb)),
      coverPhoto: gallery ? photo(galleryKb) : null,
      story: "הכרנו לפני שבע שנים בטיול בצפון. ".repeat(8),
      shuttles: [{ id: "s1", from: "תל אביב", time: "18:00", seats: 50 }],
    },
    floorPlan: floorPlanKb ? { image: photo(floorPlanKb), tablePositions: {}, elements: [] } : null,
    tokens: { rsvp: "r", album: "a", invite: "i", gift: "gi", hostess: "h", collab: "c" },
    createdAt: Date.now(), updatedAt: Date.now(), version: 12,
  };
}

const SCENARIOS = [
  { label: "80 אורחים, בלי תמונות",        guests: 80,  tables: 10, gallery: 0,  galleryKb: 0,   floorPlanKb: 0 },
  { label: "200 אורחים, בלי תמונות",       guests: 200, tables: 20, gallery: 0,  galleryKb: 0,   floorPlanKb: 0 },
  { label: "400 אורחים, בלי תמונות",       guests: 400, tables: 34, gallery: 0,  galleryKb: 0,   floorPlanKb: 0 },
  { label: "400 + מפת אולם בלבד",          guests: 400, tables: 34, gallery: 0,  galleryKb: 0,   floorPlanKb: 400 },
  { label: "400 + 6 תמונות גלריה",         guests: 400, tables: 34, gallery: 6,  galleryKb: 150, floorPlanKb: 400 },
  { label: "400 + 12 תמונות גלריה",        guests: 400, tables: 34, gallery: 12, galleryKb: 150, floorPlanKb: 400 },
  { label: "400 + 15 תמונות גלריה",        guests: 400, tables: 34, gallery: 15, galleryKb: 150, floorPlanKb: 400 },
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const page = await b.newPage();
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });

const kb = (n) => (n / 1024).toFixed(0).padStart(6) + " KB";
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

console.log("bytes are UTF-16 code units × 2 — what a browser actually charges against the quota\n");
console.log("scenario".padEnd(28) + "structure".padEnd(12) + "images".padEnd(12) + "total");

const rows = [];
for (const s of SCENARIOS) {
  const ev = buildEvent(s);
  const noImages = { ...ev, eventSite: { ...ev.eventSite, gallery: [], coverPhoto: null }, floorPlan: null };
  const r = await page.evaluate(([full, bare]) => {
    // localStorage is charged in UTF-16 code units; Hebrew is 1 unit per char
    // in the BMP, same as ASCII, so length × 2 is the honest figure. Measured
    // by writing and reading back rather than assumed.
    const size = (o) => { const s = JSON.stringify(o); return s.length * 2; };
    return { total: size(full), structure: size(bare) };
  }, [ev, noImages]);
  rows.push({ ...s, ...r, images: r.total - r.structure });
  console.log(
    s.label.padEnd(28) +
    kb(r.structure).padEnd(12) +
    kb(r.total - r.structure).padEnd(12) +
    mb(r.total)
  );
}

// What ONE debounced edit sends to Postgres. The gallery lives inside
// `eventSite`, and the up-mapper carries `eventSite` whole — so every rename of
// a venue re-uploads every photo. The floor-plan IMAGE is deliberately excluded
// from the payload for being too large; the gallery beside it is several times
// larger and is not.
console.log("\n── what one debounced edit pushes to Postgres ──");
for (const s of SCENARIOS) {
  const ev = buildEvent(s);
  // The REAL mapper, imported inside the page. In plain node it pulls in
  // supabase.js and dies on `import.meta.env`; re-implementing what it includes
  // here would be a copy that goes stale exactly when it matters.
  const bytes = await page.evaluate(async (e) => {
    const m = await import("/src/utils/cloudSync.js");
    return JSON.stringify(m.mapLocalEventToCloudPayload(e, "u1")).length;
  }, ev);
  console.log(`  ${s.label.padEnd(28)} ${mb(bytes).padStart(8)} per write`);
}

// The quota is per ORIGIN, not per event — which is the part that turns a big
// event into a broken app rather than a big event.
console.log("\n── how many such events fit in one 5MB origin quota ──");
for (const r of rows) {
  const fit = Math.floor((5 * 1024 * 1024) / r.total);
  console.log(`  ${r.label.padEnd(28)} ${String(fit).padStart(3)} events`);
}

// And the real cliff: a write that exceeds the quota fails for EVERYTHING, not
// just the event being saved.
console.log("\n── the actual failure, driven ──");
const probe = await page.evaluate(() => {
  const K = "__quota_probe__";
  let wrote = 0;
  try {
    // 512KB chunks until the browser refuses.
    const chunk = "x".repeat(256 * 1024);
    for (let i = 0; i < 200; i++) { localStorage.setItem(K + i, chunk); wrote += chunk.length * 2; }
    return { wrote, threw: false };
  } catch (e) {
    return { wrote, threw: true, name: e.name };
  } finally {
    for (let i = 0; i < 200; i++) localStorage.removeItem(K + i);
  }
});
console.log(`  this browser accepted ${mb(probe.wrote)} before ${probe.threw ? probe.name : "the loop ended"}`);
console.log("  (Chromium is ~10MB per origin; Safari is the tighter one at ~5MB, which is what the numbers above assume)");

await b.close();
