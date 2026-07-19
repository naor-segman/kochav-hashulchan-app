export function useActiveEvent(events, eventId) {
  return events.find(e => e.id === eventId) || null;
}
