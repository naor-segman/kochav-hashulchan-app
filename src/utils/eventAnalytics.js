import { computeViolations } from "../logic/seating.js";

export function eventHealth(ev) {
  const allGuests   = ev.guests      || [];
  const tables      = ev.tables      || [];
  const seating     = ev.seating     || {};
  const constraints = ev.constraints || [];

  // Guests who declined are not waiting for a seat. Counting them left every
  // event with a declined guest permanently stuck on "N מקומות ממתינים",
  // so "הושבה מלאה ✓" could never appear.
  const guests      = allGuests.filter(g => g.rsvp !== "declined");
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
  if (!allGuests.length) {
    indicators.push({ key: "no_guests", label: "אין אורחים",        severity: "muted" });
    needsAttention = true;
  } else if (!guests.length) {
    // The guest list is not empty — everyone on it declined. Without this the
    // event produced no indicators at all and the dashboard counted it as
    // "מוכן להדפסה", which is the opposite of true.
    indicators.push({ key: "all_declined", label: "כל האורחים סירבו", severity: "warn" });
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
