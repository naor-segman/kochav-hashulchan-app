import { useRef, useState } from "react";
import { useStillOnly } from "../../hooks/useMediaQuery.js";
import styles from "./LoopVideo.module.css";

/**
 * A silent product loop with the controls the law asks for (review 5.10).
 * The three videos on the home page loop for 15–16s with no way to stop them
 * — WCAG 2.2.2 (Level A) wants a pause for moving content over 5s — and the two
 * product videos kept playing under prefers-reduced-motion, which only the hero
 * honoured. Under reduced motion or save-data this is the poster, still.
 */
export default function LoopVideo({ src, poster, label, className = "", buttonClassName = "" }) {
  const still = useStillOnly();
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);

  if (still) return <img className={className} src={poster} alt={label || ""} loading="lazy" />;

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play()?.catch?.(() => {}); setPaused(false); }
    else { v.pause(); setPaused(true); }
  };
  return (
    <>
      <video ref={ref} className={className} src={src} poster={poster} autoPlay muted loop playsInline
             preload="metadata" aria-label={label || undefined} />
      <button type="button" className={[styles.toggle, buttonClassName].filter(Boolean).join(" ")} onClick={toggle}
              aria-label={paused ? "הפעלת הסרטון" : "עצירת הסרטון"}>
        <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
      </button>
    </>
  );
}
