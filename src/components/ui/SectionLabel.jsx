import styles from "./SectionLabel.module.css";

export default function SectionLabel({ children }) {
  return <div className={styles.sectionLabel}>{children}</div>;
}
