// crypto.randomUUID exists only in a secure context, so on `vite --host` over
// a LAN IP — how you'd check the RTL layout on a real phone — it is undefined.
// This module is in the eager bundle, so without a fallback the whole app
// white-screens rather than one feature failing.
export const uid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // version 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variant 10
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
};
