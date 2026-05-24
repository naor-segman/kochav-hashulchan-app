import { uid } from "./uid.js";

export function duplicateEvent(ev) {
  const tableIdMap = {};
  const tables = ev.tables.map(t => {
    const newId = uid();
    tableIdMap[t.id] = newId;
    return Object.assign({}, t, { id: newId });
  });

  const guestIdMap = {};
  const guests = ev.guests.map(g => {
    const newId = uid();
    guestIdMap[g.id] = newId;
    return Object.assign({}, g, { id: newId });
  });

  const constraints = ev.constraints.map(c => Object.assign({}, c, {
    id: uid(),
    guestA: guestIdMap[c.guestA] || c.guestA,
    guestB: guestIdMap[c.guestB] || c.guestB,
  }));

  return Object.assign({}, ev, {
    id: uid(),
    name: "עותק של " + (ev.name || ""),
    tables,
    guests,
    constraints,
    seating: {},
    createdAt: Date.now(),
  });
}
