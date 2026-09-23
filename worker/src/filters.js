export function dedupeEvents(events) {
  const result = [];
  const seenIds = new Set();

  for (const event of events || []) {
    if (!event?.id) {
      continue;
    }

    if (seenIds.has(event.id)) {
      continue;
    }

    seenIds.add(event.id);
    result.push(event);
  }

  return result;
}