import { hebrewCalendarDate } from "../../utils/hebrewDate.js";
import styles from "./HebrewDate.module.css";

/** The Hebrew date under the civil one, on every page a guest opens (137). */
export default function HebrewDate({ date, className = "" }) {
  const he = hebrewCalendarDate(date);
  if (!he) return null;
  return <span className={[styles.he, className].filter(Boolean).join(" ")}>{he}</span>;
}
