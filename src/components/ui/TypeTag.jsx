import styles from "./TypeTag.module.css";

const TYPE_MAP = {
  regular: ["רגיל",  "var(--muted)"],
  knight:  ["אביר",  "var(--bride)"],
  vip:     ["VIP",   "var(--accent)"],
  bar:     ["בר",    "var(--warn)"],
  small:   ["קטן",   "var(--green)"],
  head:    ["ראשי",  "var(--groom)"], // legacy — kept so old events still render
};

export default function TypeTag({ type }) {
  // Known type → mapped label+color; custom type → show its own name (the
  // stored string) in the neutral colour rather than a meaningless "?".
  const [label, color] = TYPE_MAP[type] || [type || "?", "var(--groom)"];
  return (
    <span className={styles.typeTag} style={{ color, borderColor: color }}>
      {label}
    </span>
  );
}
