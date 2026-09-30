/**
 * What a screen reader hears while a guest is dragged on the seating screen.
 *
 * dnd-kit's defaults are English and speak the raw ids: "Draggable item
 * 216529ae-… was dropped over droppable area table-0cdce103-…" (fourth review
 * 30.9). These name the guest and the table, in Hebrew.
 */
export function dndAnnouncements(guests, tables) {
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
    onDragEnd: ({ active, over }) => {
      const place = placeName(over?.id);
      return place ? `${guestName(active.id)} — הושבה ב${place}.` : `ההושבה של ${guestName(active.id)} לא השתנתה.`;
    },
    onDragCancel: ({ active }) => `הגרירה בוטלה — ההושבה של ${guestName(active.id)} לא השתנתה.`,
  };
}

export const DND_SCREEN_READER_INSTRUCTIONS = {
  draggable: "כדי להושיב אורח, גררו אותו אל שולחן. אפשר גם לבחור שולחן מהתפריט שליד שמו.",
};
