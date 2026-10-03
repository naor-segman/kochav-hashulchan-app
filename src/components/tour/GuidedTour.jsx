import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRestoreFocus } from "../../hooks/useRestoreFocus.js";
import { placeCard } from "../../utils/tourState.js";
import Icon from "../ui/Icon.jsx";
import base from "../../styles/screenBase.module.css";
import styles from "./GuidedTour.module.css";

/* The guided tour (WORKPLAN 124, owner 2.10 #13).
 *
 * The first time a screen opens, the page dims and ONE part of it is lit, with
 * a short card saying what it is for. "הבא" moves the light to the next part,
 * in the order a host uses them; "הקודם" goes back; "דלגו" ends it. The ⓘ
 * next to a field stays, for reading one explanation again later.
 *
 * A step names its part by `data-tour="<target>"`. CSS-module class names are
 * hashed in production, so they cannot be targets. A step whose part is not on
 * the page right now (an empty list, a section that only shows later) is
 * skipped rather than pointing at nothing; a step with no target is a centred
 * card, used to open or close a tour.
 *
 * The page underneath does not take clicks while the tour is open — a tap
 * outside the card is not "next", and a tap that reached the page would act on
 * something the host has not been told about yet. */

// The Shell's sticky top bar and areas bar together, plus a little air: the
// highest a lit part is scrolled to, so the bars never cover it.
const TALL_TOP = 124;

const findTarget = (t) => (t ? document.querySelector(`[data-tour="${t}"]`) : null);

export default function GuidedTour({ steps, onClose }) {
  // Decided once, when the tour opens: the parts that exist on this page.
  const [live] = useState(() => steps.filter(s => !s.target || findTarget(s.target)));
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);      // the lit part, viewport px
  const [pos, setPos] = useState(null);      // the card
  const cardRef = useRef(null);
  const primaryRef = useRef(null);
  const titleId = useId();
  const textId = useId();

  useRestoreFocus();

  const step = live[i];
  const last = i === live.length - 1;

  // Bring the part into view, then measure it and the card. In a frame
  // callback rather than the effect body, so the layout has settled after the
  // scroll — and so this adds nothing to the set-state-in-effect count.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = findTarget(step.target);
    if (el) {
      // Scroll so the part AND its card fit on screen together: the pair is
      // centred in the room under the sticky bars. Centring the part alone
      // left a half-screen part no room above or below, and the card landed
      // on top of what it was explaining (measured: 19 steps). A part too tall
      // to share the screen with the card is shown from its top instead, so
      // its title is in view.
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      const r = el.getBoundingClientRect();
      const cardH = cardRef.current?.offsetHeight || 240;
      const room = window.innerHeight - TALL_TOP - 16;
      const pair = r.height + 14 + cardH;
      const top = pair <= room ? TALL_TOP + (room - pair) / 2 : TALL_TOP;
      window.scrollBy({ top: r.top - top, behavior: "instant" });
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el?.getBoundingClientRect();
        const view = { w: window.innerWidth, h: window.innerHeight };
        const pad = 6;
        const lit = r ? {
          top: Math.max(0, r.top - pad), left: Math.max(0, r.left - pad),
          bottom: Math.min(view.h, r.bottom + pad), right: Math.min(view.w, r.right + pad),
        } : null;
        if (lit) { lit.width = lit.right - lit.left; lit.height = lit.bottom - lit.top; }
        const c = cardRef.current;
        const card = { w: c?.offsetWidth || 340, h: c?.offsetHeight || 200 };
        setBox(lit);
        setPos(placeCard(lit, card, view));
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Once the card is placed: until then it is visibility:hidden, and a hidden
  // button cannot take focus — the first step's focus was silently lost.
  const placed = !!pos;
  useEffect(() => { if (placed) primaryRef.current?.focus(); }, [i, placed]);

  const next = () => (last ? onClose("done") : setI(n => n + 1));
  const prev = () => setI(n => Math.max(0, n - 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose("skipped"); return; }
      // Right-to-left: the arrow that points left is "forward".
      if (e.key === "ArrowLeft")  { e.preventDefault(); next(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); prev(); return; }
      if (e.key !== "Tab") return;
      const f = cardRef.current?.querySelectorAll("button");
      if (!f || !f.length) return;
      const first = f[0], end = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!step) return null;

  return (
    <div className={styles.root}>
      {/* Catches every click on the page while the tour is open. */}
      <div className={styles.blocker} aria-hidden="true" />
      {box
        ? <div className={styles.spot} aria-hidden="true"
               style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
        : <div className={styles.dim} aria-hidden="true" />}

      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-side={pos?.side || "center"}
        data-target={step.target || undefined}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      >
        <div className={styles.head}>
          <span className={styles.count}>{i + 1} מתוך {live.length}</span>
          <button className={styles.skip} onClick={() => onClose("skipped")}>
            דלגו על ההסבר
          </button>
        </div>
        <h2 id={titleId} className={styles.title}>{step.title}</h2>
        <p id={textId} className={styles.text}>{step.text}</p>

        <div className={styles.dots} aria-hidden="true">
          {live.map((s, n) => <i key={n} className={n === i ? styles.dotOn : n < i ? styles.dotPast : undefined} />)}
        </div>

        <div className={styles.actions}>
          {i > 0 && (
            <button className={base.btnSecondary} onClick={prev}>
              <Icon name="arrowRight" size={14} /> הקודם
            </button>
          )}
          <button ref={primaryRef} className={[base.btnPrimary, styles.next].join(" ")} onClick={next}>
            {last ? (step.done || "הבנתי") : <>הבא <Icon name="arrowLeft" size={14} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
