// V1 storage helpers — copied verbatim from legacy/v1-seating-app.jsx

import { STORAGE_KEY } from "../data/constants.js";

export function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return { events: [] };
}

export function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
