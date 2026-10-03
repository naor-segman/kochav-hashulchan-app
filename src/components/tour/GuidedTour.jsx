import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRestoreFocus } from "../../hooks/useRestoreFocus.js";
import { placeCard, litBox, unionRect } from "../../utils/tourState.js";
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
 * The page underneath takes nothing while the tour is open — not a tap (a tap
 * outside the card is not "next"), and not the KEYBOARD: the page is `inert`
 * for the tour's lifetime. Until 3.10 only the mouse was blocked, and a review
 * agent tabbed out of the card, opened a delete confirm hidden under the scrim
 * and deleted a guest. `inert` also takes the page out of the screen reader's
 * reach, which is what aria-modal promises and does not enforce. The tour is
 * portalled to <body> so that "everything but the tour" is its siblings. */

const findTarget = (t) => (t ? document.querySelector(`[data-tour="${t}"]`) : null);

// The bottom of the bars stuck to the top of the screen (the Shell's top bar
// and areas bar; the door's own bar). Measured rather than assumed: the door
// has one bar, the Shell two, the dashboard none.
function stickyBottom() {
  let bottom = 0;
  const bars = [...document.querySelectorAll("header, nav")]
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.height > 0 && /sticky|fixed/.test(getComputedStyle(el).position))
    .sort((a, b) => a.r.top - b.r.top);
  for (const { r } of bars) if (r.top <= bottom + 2) bottom = Math.max(bottom, r.bottom);
  return bottom;
}

// The part's box: its own, or — for data-tour-fit — the box around its
// children, so a row of three chips is not lit across the whole page width.
function partRect(el) {
  if (el.hasAttribute("data-tour-fit")) {
    const u = unionRect([...el.children].map(c => c.getBoundingClientRect()));
    if (u) return u;
  }
  return el.getBoundingClientRect();
}

export default function GuidedTour({ steps, onClose }) {
  // Decided once, when the tour opens: the parts that exist on this page.
  const [live] = useState(() => steps.filter(s => !s.target || findTarget(s.target)));
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);      // the lit part, viewport px
  const [pos, setPos] = useState(null);      // the card
  const [moved, setMoved] = useState(false); // has the host stepped yet?
  const rootRef = useRef(null);
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
    // Scroll so the part AND its card fit on screen together, the pair
    // centred in the room under the sticky bars. Centring the part alone left
    // a half-screen part no room above or below (19 steps, measured). A part
    // too tall to share the screen with its card is shown from its top.
    // Run again once scrolling settles: a screen that focuses a field as it
    // opens (the guest form) is still smooth-scrolling when the tour starts,
    // and the part landed in a different place on every run (3.10).
    const align = () => {
      if (!el) return;
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      const r = partRect(el);
      const inset = stickyBottom() + 12;
      const cardH = cardRef.current?.offsetHeight || 240;
      const room = window.innerHeight - inset - 16;
      const pair = r.height + 14 + cardH;
      const want = pair <= room ? inset + (room - pair) / 2 : inset;
      if (Math.abs(r.top - want) > 4) window.scrollBy({ top: r.top - want, behavior: "instant" });
    };
    align();
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = { w: window.innerWidth, h: window.innerHeight };
        const r = el ? partRect(el) : null;
        // A part that IS in a sticky bar (the areas bar, the door's own bar)
        // is lit where it is; anything else stays below the bars.
        const inBar = !!el?.closest("header, nav") && /sticky|fixed/.test(getComputedStyle(el.closest("header, nav")).position);
        let lit = r ? litBox(r, view, { topLimit: inBar ? -4 : stickyBottom() }) : null;
        const c = cardRef.current;
        const card = { w: c?.offsetWidth || 340, h: c?.offsetHeight || 200 };
        const at = placeCard(lit, card, view);
        // A part too tall to share the screen: the card sits over its lower
        // end, so the light stops just above the card and its ring closes
        // where it can be seen, instead of running on behind the card.
        if (lit && at.side === "over" && at.top - 10 - lit.top > 40) {
          lit = { ...lit, bottom: at.top - 10, height: at.top - 10 - lit.top };
        }
        if (lit) {
          // The ring follows the part's own corners (a card's 18px, padded).
          const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
          lit.radius = rad ? rad + 6 : null;
        }
        setBox(lit);
        setPos(at);
      });
    };
    measure();
    const settle = setTimeout(() => { align(); measure(); }, 350);
    const onEnd = () => { align(); measure(); };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("scrollend", onEnd, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("scrollend", onEnd);
    };
  }, [step]);

  // Everything but the tour is inert while it is open (see the note at the
  // top). Layout effect, so its cleanup runs before useRestoreFocus hands
  // focus back to a control on the page.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const others = [...document.body.children].filter(n => n !== root && !n.contains(root));
    const was = others.map(n => n.inert);
    others.forEach(n => { n.inert = true; });
    return () => others.forEach((n, k) => { n.inert = was[k]; });
  }, []);

  // Once the card is placed: until then it is visibility:hidden, and a hidden
  // button cannot take focus — the first step's focus was silently lost.
  const placed = !!pos;
  useEffect(() => { if (placed) primaryRef.current?.focus(); }, [i, placed]);

  const next = () => { if (last) onClose("done"); else { setI(n => n + 1); setMoved(true); } };
  const prev = () => { setI(n => Math.max(0, n - 1)); setMoved(true); };

  useEffect(() => {
    const onKey = (e) => {
      // Alt+← is the browser's Back; nothing with a modifier is the tour's.
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") { e.preventDefault(); onClose("skipped"); return; }
      // Right-to-left: the arrow that points left is "forward".
      if (e.key === "ArrowLeft")  { e.preventDefault(); next(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); prev(); return; }
      if (e.key !== "Tab") return;
      const f = cardRef.current?.querySelectorAll("button");
      if (!f || !f.length) return;
      const first = f[0], end = f[f.length - 1];
      // Focus that is not in the card at all (a tap on the dimmed page sends
      // it to <body>) comes back into the card, never on to the page.
      const inside = cardRef.current.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === end)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!step) return null;

  return createPortal(
    <div className={styles.root} ref={rootRef}>
      {/* Read out when the host steps: focus stays on "הבא", so nothing else
          would tell a screen-reader user that the card changed. Silent on
          the first step, which the dialog's own name and description cover. */}
      <p className="sr-only" aria-live="polite">
        {moved ? `${i + 1} מתוך ${live.length}. ${step.title}. ${step.text}` : ""}
      </p>
      {/* Catches every click on the page while the tour is open. */}
      <div className={styles.blocker} aria-hidden="true" />
      {box
        ? <div className={styles.spot} aria-hidden="true"
               style={{ top: box.top, left: box.left, width: box.width, height: box.height,
                        ...(box.radius ? { borderRadius: box.radius } : {}) }} />
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
    </div>,
    document.body,
  );
}
