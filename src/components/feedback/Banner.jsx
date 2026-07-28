import styles from "./Banner.module.css";

export default function Banner({ variant, children }) {
  // "err" used to fall through to the warn styling, so RSVPResponsesScreen's
  // failure banner rendered as a caution — a load that failed looked like a
  // heads-up.
  const variantClass =
    variant === "ok"  ? styles.ok  :
    variant === "err" ? styles.err :
    styles.warn;
  return (
    <div className={[styles.banner, variantClass].join(" ")}>
      {children}
    </div>
  );
}
