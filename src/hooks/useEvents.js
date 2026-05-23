import { useState, useEffect, useCallback } from "react";
import { loadState, persist } from "../utils/storage.js";

export function useEvents() {
  // Lazy initializer reads localStorage synchronously on first render,
  // preventing a flash-redirect when the router sees an empty events array
  // before useEffect fires.
  const [events, setEvents] = useState(() => loadState().events || []);

  useEffect(() => { persist({ events }); }, [events]);

  const addEvent = useCallback((ev) => {
    setEvents(prev => [ev, ...prev]);
  }, []);

  const removeEvent = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const patchEventById = useCallback((id, patch) => {
    setEvents(prev => prev.map(e =>
      e.id === id
        ? (typeof patch === "function" ? patch(e) : Object.assign({}, e, patch))
        : e
    ));
  }, []);

  return { events, addEvent, removeEvent, patchEventById };
}
