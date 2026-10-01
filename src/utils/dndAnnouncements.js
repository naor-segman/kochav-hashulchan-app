/**
 * What a screen reader hears while a guest is dragged on the seating screen.
 *
 * dnd-kit's defaults are English and speak the raw ids: "Draggable item
 * 216529ae-… was dropped over droppable area table-0cdce103-…" (fourth review
 * 30.9). These name the guest and the table, in Hebrew.
 */
export function dndAnnouncements(guests, tables, seating = {}) {
  const guestName = (id) => (guests || []).find(g => g.id === id)?.name || "אורח";
  const placeName = (id) => {
    if (id == null) return null;
    if (id === "unassigned") return "רשימת הלא משובצים";
    const sid = String(id);
    if (sid.startsWith("table-")) {
      const t = (tables || []).find(x => x.id === sid.slice(6));
      return t?.name ? `שולחן ${t.name}`.replace(/^שולחן שולחן/, "שולחן") : "שולחן";
    }
    return null;
  };
  return {
    onDragStart: ({ active }) => `הרמתם את ${guestName(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const place = placeName(over?.id);
      return place ? `${guestName(active.id)} מעל ${place}.` : `${guestName(active.id)} לא מעל אף שולחן.`;
    },
    // Says what HAPPENED — the same rules as the drop handler. A drop on a
    // full table, on the guest's own table, or of an unseated guest onto the
    // waiting list changes nothing, and the reader heard "הושבה" (fifth review).
    onDragEnd: ({ active, over }) => {
      const name = guestName(active.id);
      const place = placeName(over?.id);
      const unchanged = `ההושבה של ${name} לא השתנתה.`;
      if (!place) return unchanged;
      if (over.id === "unassigned") return seating[active.id] ? `${name} הוחזר/ה לרשימת הלא משובצים.` : unchanged;
      const tid = String(over.id).slice(6);
      if (seating[active.id] === tid) return unchanged;
      const t = (tables || []).find(x => x.id === tid);
      if (t) {
        const seats = (g) => g.count || 1;
        const used = (guests || []).filter(g => seating[g.id] === tid).reduce((s, g) => s + seats(g), 0);
        const me = (guests || []).find(g => g.id === active.id);
        if (used + (me ? seats(me) : 1) > (t.capacity || 0)) return `${place} מלא — ${unchanged}`;
      }
      return `${name} — הושבה ב${place}.`;
    },
    onDragCancel: ({ active }) => `הגרירה בוטלה — ההושבה של ${guestName(active.id)} לא השתנתה.`,
  };
}

export const DND_SCREEN_READER_INSTRUCTIONS = {
  draggable: "כדי להושיב אורח, גררו אותו אל שולחן. אפשר גם לבחור שולחן מהתפריט שליד שמו.",
};
