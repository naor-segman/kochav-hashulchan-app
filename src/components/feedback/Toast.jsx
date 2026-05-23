import styles from "./Toast.module.css";

export default function Toast({ msg, variant }) {
  return (
    <div className={[styles.toast, variant === "err" && styles.err].filter(Boolean).join(" ")}>
      {msg}
    </div>
  );
}
