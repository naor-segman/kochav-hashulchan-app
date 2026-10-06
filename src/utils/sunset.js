/* Sunset in Israel, for the Hebrew date of an evening event (137, owner 6.10:
 * "התאריך העברי המדויק לאותו זמן של האירוע").
 *
 * The Hebrew day begins at sunset, so a wedding at 19:30 on a Tuesday in
 * October is already Wednesday's Hebrew date. The sum is the NOAA sunrise/
 * sunset algorithm (the "Almanac for Computers" form), accurate to about a
 * minute — good enough for a date, which only changes for an event that starts
 * within minutes of sunset.
 *
 * WHERE: the coastal plain (Tel Aviv, 32.08°N 34.78°E), because the venue is a
 * free-text name with no coordinates and most halls are there. Sunset in
 * Jerusalem is ~2 minutes earlier, in Eilat ~10 minutes later and in the north
 * ~3 minutes earlier: an event whose start is within minutes of sunset could
 * land on either date. Said here so nobody mistakes it for a halachic zman.
 */
const LAT = 32.08;
const LNG = 34.78;
const ZENITH = 90.833;              // official sunset: the upper limb on a refracted horizon
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

/** Sunset on "YYYY-MM-DD" in Israel, as epoch ms (UTC). NaN for a non-date. */
export function israelSunsetMs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return NaN;
  const y = +m[1], mo = +m[2], d = +m[3];
  const day0 = Date.UTC(y, mo - 1, d);
  if (new Date(day0).getUTCMonth() !== mo - 1) return NaN;
  const N = Math.round((day0 - Date.UTC(y, 0, 1)) / 86400000) + 1;   // whole days, no DST in UTC

  const lngHour = LNG / 15;
  const t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = mod(M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = mod(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(LAT))) / (cosDec * Math.cos(rad(LAT)));
  const H = deg(Math.acos(cosH)) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = mod(T - lngHour, 24);
  return day0 + Math.round(UT * 3600000);
}
