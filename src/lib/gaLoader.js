// Google's tag (gtag.js), set up exactly as Google documents it — a dataLayer
// and a gtag() that pushes its `arguments` object (gtag.js reads Arguments
// objects, not arrays, so this cannot be a rest parameter) — plus the script.
//
// A module of its own so the tests can stand in for it: nothing here runs
// until analytics.js has a yes to the cookie question (126/127).
export function loadGtag(id) {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
  return gtag;
}
