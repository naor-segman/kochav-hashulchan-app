import styles from "./SideDot.module.css";

export default function SideDot({ side }) {
  const bg = side === "bride" ? "var(--bride)" : "var(--groom)";
  return <span className={styles.dot} style={{ background: bg }} />;
}
