import styles from "./LaptopFrame.module.css";

/**
 * A thin-bezel laptop around a desktop capture (136, owner 5.10: "בגירסת
 * מחשב לעשות מחשב ובטלפון לעשות אייפון — או לשלב"). CSS only, like PhoneFrame.
 */
export default function LaptopFrame({ src, video, poster, alt = "", className = "" }) {
  return (
    <div className={[styles.laptop, className].filter(Boolean).join(" ")}>
      <div className={styles.lid}>
        <span className={styles.camera} aria-hidden="true" />
        <div className={styles.screen}>
          {video ? (
            <video className={styles.media} src={video} poster={poster} autoPlay muted loop playsInline preload="metadata" aria-label={alt || undefined} />
          ) : (
            <img className={styles.media} src={src} alt={alt} loading="lazy" />
          )}
        </div>
      </div>
      <div className={styles.base} aria-hidden="true"><span className={styles.notch} /></div>
    </div>
  );
}
