export function filterEventsByActor(events, actorId) {
  if (!actorId) return [];
  if (!Array.isArray(events)) return [];
  return events.filter((event) => event.actorId === actorId);
}
