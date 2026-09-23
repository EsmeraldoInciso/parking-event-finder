const PARKING_WORDS = [
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

export function isParkingFeedEvent(event) {
  if (!event) {
    return false;
  }

  const searchableText = normalizeText(
    [
      event.eventName,
      event.eventNotes,
      event.eventInfo,
      event.primaryEventUrl,
      event.venue?.venueName,
      ...(event.attractions || []).map(
        (item) =>
          item?.attraction?.attractionName ||
          item?.attraction?.name ||
          ""
      ),
    ].join(" ")
  );

  if (!searchableText) {
    return false;
  }

  return PARKING_WORDS.some((keyword) =>
    searchableText.includes(normalizeText(keyword))
  );
}

export function feedEventMatchesKeyword(event, keyword) {
  if (!keyword) {
    return true;
  }

  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return true;
  }

  const attractionNames = (event.attractions || [])
    .map(
      (item) =>
        item?.attraction?.attractionName ||
        item?.attraction?.name ||
        ""
    )
    .join(" ");

  const searchableText = normalizeText(
    [
      event.eventName,
      event.eventNotes,
      event.eventInfo,
      event.primaryEventUrl,
      event.venue?.venueName,
      attractionNames,
      event.venue?.venueCity,
      event.venue?.venueStateCode,
    ].join(" ")
  );

  return searchableText.includes(normalizedKeyword);
}

export function normalizeFeedEvent(event) {
  if (!event) {
    return null;
  }

  const attractions = (event.attractions || [])
    .map((item) => item?.attraction)
    .filter(Boolean);

  return {
    id:
      event.eventId ||
      event.legacyEventId ||
      null,

    legacyEventId:
      event.legacyEventId ||
      null,

    name:
      event.eventName ||
      "Parking",

    eventUrl:
      event.primaryEventUrl ||
      null,

    resaleEventUrl:
      event.resaleEventUrl ||
      null,

    status:
      event.eventStatus ||
      null,

    localDate:
      event.eventStartLocalDate ||
      null,

    localTime:
      event.eventStartLocalTime ||
      null,

    startDateTime:
      event.eventStartDateTime ||
      null,

    venue: event.venue
      ? {
          name:
            event.venue.venueName ||
            null,

          id:
            event.venue.venueId ||
            null,

          city:
            event.venue.venueCity ||
            null,

          state:
            event.venue.venueStateCode ||
            null,

          country:
            event.venue.venueCountryCode ||
            null,

          latitude:
            event.venue.venueLatitude ??
            null,

          longitude:
            event.venue.venueLongitude ??
            null,

          street:
            event.venue.venueStreet ||
            null,

          zipCode:
            event.venue.venueZipCode ||
            null,

          timezone:
            event.venue.venueTimezone ||
            null,
        }
      : null,

    attractions: attractions.map((attraction) => ({
      id:
        attraction.attractionId ||
        null,

      name:
        attraction.attractionName ||
        attraction.name ||
        null,

      url:
        attraction.attractionUrl ||
        null,
    })),

    imageUrl:
      event.eventImageUrl ||
      null,

    notes:
      event.eventNotes ||
      null,

    info:
      event.eventInfo ||
      null,

    source: "ticketmaster-discovery-feed",
  };
}

export function findParkingEvents(events, keyword = "") {
  const results = [];
  const seenIds = new Set();

  for (const event of events || []) {
    if (!event) {
      continue;
    }

    if (!isParkingFeedEvent(event)) {
      continue;
    }

    if (!feedEventMatchesKeyword(event, keyword)) {
      continue;
    }

    const normalized = normalizeFeedEvent(event);

    if (!normalized) {
      continue;
    }

    const id =
      normalized.id ||
      normalized.eventUrl ||
      normalized.name;

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    results.push(normalized);
  }

  return results;
}