import { STORAGE_KEY } from "../data/constants.js";

/** Load the full app state from localStorage. Returns { events: [] } on miss. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { events: [] };
}

/** Persist the full app state snapshot to localStorage. */
export function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
