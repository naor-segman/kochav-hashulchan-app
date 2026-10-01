import styles from "./GuestPrivacyNote.module.css";

/**
 * The notice a guest gets where they hand over their details (checklist 103).
 *
 * §11 of the Privacy Protection Law asks for it at the point of collection,
 * and a guest never sees the signup screen or the footer — every guest form
 * was collecting a name and a phone with no word about where they go. One
 * line, then the guests' section of the privacy page in a new tab, so the
 * half-filled form is still there when they come back.
 *
 * `text` replaces the sentence where "kept by the hosts" is not the whole
 * truth: the album and the family table are seen by everyone holding the
 * link, and the note has to say so.
 */
export default function GuestPrivacyNote({ text = "מסירת הפרטים רשות. הם נשמרים אצל בעלי האירוע, רק לצורך האירוע." }) {
  return (
    <p className={styles.note}>
      {text}{" "}
      <a href="/privacy#guests" target="_blank" rel="noopener" className={styles.link}>
        מדיניות הפרטיות
      </a>
    </p>
  );
}
