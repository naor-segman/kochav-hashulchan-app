import { useDraggable } from "@dnd-kit/core";
import Icon from "../ui/Icon.jsx";
// The seating screen's stylesheet, on purpose: these rows are the seating
// screen's own chrome and share `.tableCardsDragging .tCard …` descendant
// selectors with it. Splitting the classes into a second module would break
// those selectors (different hashes) for no gain.
import styles from "../../screens/SeatingScreen.module.css";

/**
 * One draggable guest row. Used by the waiting list and by every table card,
 * which is why it lives here rather than inside SeatingScreen.
 *
 * The drag itself is @dnd-kit and has been repaired three times — the handle,
 * the pointer-first collision strategy and MeasuringStrategy.Always all live in
 * SeatingScreen. Nothing here may swallow a pointerdown that dnd-kit needs.
 */
export default function DraggableGuestRow({ guestId, className, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: guestId });
  return (
    <div
      ref={setNodeRef}
      className={[className, styles.draggableRow, isDragging ? styles.guestDragging : ""].filter(Boolean).join(" ")}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dragHandle} aria-hidden="true"><Icon name="grip" size={16} /></span>
      {children}
    </div>
  );
}
