import styles from "./Banner.module.css";

export default function Banner({ variant, children }) {
  const variantClass = variant === "ok" ? styles.ok : styles.warn;
  return (
    <div className={[styles.banner, variantClass].join(" ")}>
      {children}
    </div>
  );
}
