/**
 * QR payload contract for check-in, kept out of the component.
 *
 * These live here rather than in QrScanner.jsx so the component file exports a
 * component and nothing else — a mixed export file breaks Vite fast refresh and
 * lets a plain string-parsing bug take the whole scanner panel down with it.
 *
 * A scanned code carries a guest id, either bare, prefixed with `kh1:`, or
 * inside a URL as `?g=<id>`. Matching an id to a guest is the caller's job, so
 * nothing here knows about events.
 */

/** The native BarcodeDetector ships in Chrome/Edge/Android, not Safari/Firefox. */
export function isScanSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/** Pull a guest id out of a scanned payload — bare id, URL param, or kh1: prefix. */
export function parseScanPayload(raw) {
  const text = (raw || "").trim();
  if (!text) return null;
  if (text.startsWith("kh1:")) return text.slice(4) || null;
  try {
    const u = new URL(text);
    const g = u.searchParams.get("g");
    if (g) return g;
  } catch {
    // Not a URL — fall through and treat the whole string as the id.
  }
  // Ignore anything that looks like a link but carried no guest id, so a guest
  // scanning the generic event invite doesn't check in a random person.
  if (/^https?:/i.test(text)) return null;
  return text;
}
