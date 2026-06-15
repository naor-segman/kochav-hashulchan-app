import { computeViolations } from "../logic/seating.js";

export function eventHealth(ev) {
  const guests      = ev.guests      || [];
  const tables      = ev.tables      || [];
  const seating     = ev.seating     || {};
  const constraints = ev.constraints || [];

  const totalSeats  = guests.reduce((s, g) => s + (g.count || 1), 0);
  const seatedSeats = guests
    .filter(g => seating[g.id])
    .reduce((s, g) => s + (g.count || 1), 0);
  const unassigned  = totalSeats - seatedSeats;
  const pct         = totalSeats > 0 ? seatedSeats / totalSeats : 0;
  const viols       = tables.length && guests.length
    ? computeViolations(guests, tables, constraints, seating).length
    : 0;

  const indicators   = [];
  let needsAttention = false;

  if (!ev.name) {
    indicators.push({ key: "no_name",  label: "חסר שם אירוע",      severity: "muted" });
    needsAttention = true;
  }
  if (!tables.length) {
    indicators.push({ key: "no_tables", label: "אין שולחנות",       severity: "muted" });
    needsAttention = true;
  }
  if (!guests.length) {
    indicators.push({ key: "no_guests", label: "אין אורחים",        severity: "muted" });
    needsAttention = true;
  }
  if (guests.length > 0 && seatedSeats === 0) {
    indicators.push({ key: "not_seated", label: "הושבה לא בוצעה",  severity: "warn" });
    needsAttention = true;
  } else if (unassigned > 0) {
    indicators.push({ key: "unassigned", label: unassigned + " מקומות ממתינים", severity: "warn" });
    needsAttention = true;
  }
  if (viols > 0) {
    indicators.push({ key: "violations", label: viols + " הפרות",   severity: "warn" });
    needsAttention = true;
  }
  if (guests.length > 0 && unassigned === 0 && viols === 0) {
    indicators.push({ key: "complete", label: "הושבה מלאה ✓",      severity: "ok" });
  }

  return { pct, indicators, needsAttention, totalSeats, seatedSeats, unassigned, viols };
}

export function dashStats(events) {
  let totalGuests   = 0;
  let seatedGuests  = 0;
  let totalViols    = 0;
  let needAttention = 0;
  let readyToPrint  = 0;

  for (const ev of events) {
    const h = eventHealth(ev);
    totalGuests  += h.totalSeats;
    seatedGuests += h.seatedSeats;
    totalViols   += h.viols;
    if (h.needsAttention) needAttention++;
    else if (ev.guests.length > 0) readyToPrint++;
  }

  return {
    totalEvents: events.length,
    totalGuests,
    seatedGuests,
    seatedPct: totalGuests > 0 ? Math.round((seatedGuests / totalGuests) * 100) : 0,
    totalViols,
    needAttention,
    readyToPrint,
  };
}

export function summaryMessages(stats) {
  const msgs = [];
  if (stats.needAttention > 0) {
    msgs.push({
      text: stats.needAttention === 1
        ? "אירוע אחד דורש טיפול"
        : stats.needAttention + " אירועים דורשים טיפול",
      severity: "warn",
    });
  }
  if (stats.readyToPrint > 0) {
    msgs.push({
      text: stats.readyToPrint === 1
        ? "אירוע אחד מוכן להדפסה"
        : stats.readyToPrint + " אירועים מוכנים להדפסה",
      severity: "ok",
    });
  }
  const unassigned = stats.totalGuests - stats.seatedGuests;
  if (unassigned > 0) {
    msgs.push({ text: "נשארו " + unassigned + " מקומות ללא שיבוץ", severity: "warn" });
  }
  return msgs;
}
