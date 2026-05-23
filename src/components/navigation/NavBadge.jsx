import styles from "./NavBadge.module.css";

export default function NavBadge({ n, color }) {
  const overrides = color
    ? { background: color + "22", color }
    : undefined;
  return (
    <span className={styles.badge} style={overrides}>
      {color ? ("⚠ " + n) : n}
    </span>
  );
}
