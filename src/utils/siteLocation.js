/**
 * Where the event site says the event is (owner, 3.10).
 *
 * The site's "מיקום והגעה" section (address, Waze, add-to-calendar) appeared
 * only once the host typed an address into the site editor — the venue from
 * the event's own details was never used, so a host who never opened that
 * card published a site with no directions at all. Now the venue is the
 * default and an address typed in the editor replaces it.
 */
export function siteLocation(site, ev) {
  return (site?.address || "").trim() || (ev?.venue || "").trim();
}
