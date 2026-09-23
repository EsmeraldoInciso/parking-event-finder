const PARKING_KEYWORDS = [
  "parking",
  "parking pass",
  "parking permit",
  "event parking",
  "venue parking",
  "stadium parking",
  "concert parking",
  "football parking",
  "basketball parking",
  "baseball parking",
  "soccer parking",
  "arena parking",
  "lot parking",
  "parking lot",
  "tailgate parking",
];

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isParkingEvent(event) {
  if (!event) {
    return false;
  }

  const name = normalizeText(
    event.name
  );

  if (!name) {
    return false;
  }

  return PARKING_KEYWORDS.some(
    (keyword) =>
      name.includes(
        normalizeText(keyword)
      )
  );
}

export function normalizeParkingEvent(event) {
  if (!event?.id) {
    return null;
  }

  const venue =
    event._embedded?.venues?.[0] || {};

  const attractions =
    event._embedded?.attractions || [];

  return {
    id: event.id,

    name:
      event.name ||
      "Parking",

    venue:
      venue.name ||
      null,

    venueId:
      venue.id ||
      null,

    city:
      venue.city?.name ||
      null,

    state:
      venue.state?.stateCode ||
      venue.state?.name ||
      null,

    country:
      venue.country?.countryCode ||
      venue.country?.name ||
      null,

    localDate:
      event.dates?.start?.localDate ||
      null,

    localTime:
      event.dates?.start?.localTime ||
      null,

    eventUrl:
      event.url ||
      null,

    attractions:
      attractions
        .map(
          (attraction) =>
            attraction?.name || ""
        )
        .filter(Boolean),

    attractionIds:
      attractions
        .map(
          (attraction) =>
            attraction?.id || null
        )
        .filter(Boolean),

    classification: {
      segment:
        event.classifications?.[0]
          ?.segment?.name ||
        null,

      genre:
        event.classifications?.[0]
          ?.genre?.name ||
        null,
    },

    rawName:
      event.name ||
      null,
  };
}

export function normalizeParkingEvents(
  events
) {
  const unique = [];
  const seenIds = new Set();

  for (const event of events || []) {
    if (!event?.id) {
      continue;
    }

    if (seenIds.has(event.id)) {
      continue;
    }

    if (!isParkingEvent(event)) {
      continue;
    }

    seenIds.add(event.id);

    const normalized =
      normalizeParkingEvent(event);

    if (normalized) {
      unique.push(normalized);
    }
  }

  return unique;
}