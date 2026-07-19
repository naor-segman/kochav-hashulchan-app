import styles from "./TypeTag.module.css";

const TYPE_MAP = {
  regular: ["רגיל",  "var(--muted)"],
  vip:     ["VIP",   "var(--accent)"],
  head:    ["ראשי",  "var(--groom)"],
};

export default function TypeTag({ type }) {
  const [label, color] = TYPE_MAP[type] || ["?", "var(--muted)"];
  return (
    <span className={styles.typeTag} style={{ color, borderColor: color }}>
      {label}
    </span>
  );
}
