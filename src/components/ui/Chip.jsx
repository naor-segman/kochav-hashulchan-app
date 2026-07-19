import styles from "./Chip.module.css";

export default function Chip({ icon, label }) {
  return <span className={styles.chip}>{icon} {label}</span>;
}
