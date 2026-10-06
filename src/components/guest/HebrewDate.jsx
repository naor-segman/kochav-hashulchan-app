import { hebrewCalendarDate, hebrewDateTime } from "../../utils/hebrewDate.js";
import styles from "./HebrewDate.module.css";

/** The Hebrew date under the civil one, on every page a guest opens (137).
 *  `time` is the event's start ("HH:MM", Israel): after sunset the Hebrew
 *  date is the next day's. */
export default function HebrewDate({ date, time, event, className = "" }) {
  const he = hebrewCalendarDate(date, time ?? hebrewDateTime(event));
  if (!he) return null;
  return <span className={[styles.he, className].filter(Boolean).join(" ")}>{he}</span>;
}
