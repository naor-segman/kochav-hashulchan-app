import { useEffect, useRef } from "react";
import { FLOORPLAN_NOT_SAVED_EVENT } from "../utils/storage.js";

const ONCE_PER_MS = 60_000;

/**
 * Tell the host when this browser's storage is full.
 *
 * Two different situations since 33b (1.10): nothing could be written — the
 * old toast, still true — or everything was written EXCEPT the floor-plan
 * sketches, which live only on this device and never sync. The second used to
 * be silent: the upload had just said "הסקיצה הועלתה בהצלחה" and the sketch
 * was gone on the next reload. Each says so at most once a minute, because a
 * full storage fails on every save and a toast per keystroke helps nobody.
 */
export function useStorageWarnings(showToast) {
  const last = useRef({ quota: 0, plan: 0 });
  useEffect(() => {
    const once = (k, fn) => () => {
      const now = Date.now();
      if (now - last.current[k] < ONCE_PER_MS) return;
      last.current[k] = now;
      fn();
    };
    const quota = once("quota", () =>
      showToast("הנפח המקומי מלא — הנתונים לא נשמרו! ייצאו לאקסל כעת.", "err"));
    const plan = once("plan", () =>
      showToast("הנפח במכשיר מלא — סקיצת האולם לא נשמרה במכשיר הזה. שאר האירוע נשמר.", "err"));
    window.addEventListener("storage-quota-exceeded", quota);
    window.addEventListener(FLOORPLAN_NOT_SAVED_EVENT, plan);
    return () => {
      window.removeEventListener("storage-quota-exceeded", quota);
      window.removeEventListener(FLOORPLAN_NOT_SAVED_EVENT, plan);
    };
  }, [showToast]);
}
