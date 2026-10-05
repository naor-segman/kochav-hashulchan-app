import styles from "./PhoneFrame.module.css";
import LoopVideo from "./LoopVideo.jsx";

/**
 * A current-generation phone around a real screenshot or screen recording
 * (136 — the owner liked the phone frames but "צריך להפוך את זה לטלפון אייפון
 * חדש יפה"). Thin titanium edge, near-black glass, a Dynamic Island, side
 * buttons — drawn in CSS so it is sharp at every size and costs no image.
 *
 * The screen keeps the 9:19.5 proportion of the device, and the media fills it
 * from the top: these are captures of a scrolling app, so the top is the part
 * that has to be in the picture.
 */
export default function PhoneFrame({ src, video, poster, alt = "", className = "", lazy = true }) {
  return (
    <div className={[styles.device, className].filter(Boolean).join(" ")}>
      <span className={styles.btnAction} aria-hidden="true" />
      <span className={styles.btnUp} aria-hidden="true" />
      <span className={styles.btnDown} aria-hidden="true" />
      <span className={styles.btnPower} aria-hidden="true" />
      <div className={styles.screen}>
        <span className={styles.island} aria-hidden="true" />
        {video ? (
          <LoopVideo className={styles.media} src={video} poster={poster} label={alt} />
        ) : (
          <img className={styles.media} src={src} alt={alt} loading={lazy ? "lazy" : "eager"} />
        )}
      </div>
    </div>
  );
}
