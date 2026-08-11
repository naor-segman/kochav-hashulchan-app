import styles from "./TypeTag.module.css";

const TYPE_MAP = {
  regular: ["רגיל",  "var(--muted)"],
  knight:  ["אביר",  "var(--bride)"],
  // --accent-text, not --accent: this value lands on TEXT, and --accent is
  // 3.80:1. The fill-only rule is enforced in CSS everywhere else; an inline
  // style is the one place it could slip through.
  vip:     ["VIP",   "var(--accent-text)"],
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
