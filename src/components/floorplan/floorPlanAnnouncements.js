import { dndAnnouncements } from "../../utils/dndAnnouncements.js";

/**
 * What a screen reader hears while something is dragged on the venue sketch
 * (AX8). dnd-kit's defaults are English and speak raw ids ("Draggable item
 * chip-0cdce103-… was dropped over droppable area chip-…").
 *
 * Two things move here: a GUEST pill onto a table chip (the same act as on
 * the seating screen, so the seating screen's announcements are reused — the
 * chip's droppable id `chip-<tableId>` is translated to their `table-<tableId>`)
 * and a TABLE chip around the sketch, which has its own lines.
 */
export function floorPlanAnnouncements(guests, tables, seating = {}) {
  const seat = dndAnnouncements(guests, tables, seating);
  const isChip = (id) => String(id ?? "").startsWith("chip-");
  const tableName = (chipId) => {
    const t = (tables || []).find(x => x.id === String(chipId).slice(5));
    return t?.name ? `שולחן ${t.name}`.replace(/^שולחן שולחן/, "שולחן") : "השולחן";
  };
  const asSeating = (over) => (over && isChip(over.id) ? { ...over, id: "table-" + String(over.id).slice(5) } : over);

  return {
    onDragStart: ({ active }) =>
      isChip(active.id) ? `הרמתם את ${tableName(active.id)}. הזיזו בחיצים ולחצו רווח כדי להניח.` : seat.onDragStart({ active }),
    onDragOver: ({ active, over }) =>
      isChip(active.id) ? undefined : seat.onDragOver({ active, over: asSeating(over) }),
    onDragEnd: ({ active, over }) =>
      isChip(active.id) ? `${tableName(active.id)} הוזז על הסקיצה.` : seat.onDragEnd({ active, over: asSeating(over) }),
    onDragCancel: ({ active }) =>
      isChip(active.id) ? `הגרירה בוטלה — ${tableName(active.id)} נשאר במקומו.` : seat.onDragCancel({ active }),
  };
}

export const FLOOR_PLAN_SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "כדי להזיז שולחן על הסקיצה או להושיב אורח בשולחן: לחצו רווח, הזיזו בחיצים, ולחצו רווח שוב כדי להניח. Escape מבטל.",
};
