export function normalizeEvent(event) {
  if (!event || !event.id) {
    return null;
  }

  const venue =
    event._embedded?.venues?.[0] || {};

  const attractions =
    event._embedded?.attractions || [];

  const artist =
    attractions
      .map(
        (attraction) =>
          attraction.name
      )
      .filter(Boolean)
      .join(", ");

  const localDate =
    event.dates?.start?.localDate ||
    null;

  const localTime =
    event.dates?.start?.localTime ||
    null;

  const rawStatus =
    event.dates?.status?.code ||
    event.dates?.status?.name ||
    null;

  const status =
    normalizeStatus(rawStatus);

  const seatMap =
    event.seatmap ||
    null;

  const eventMapAvailable =
    Boolean(seatMap?.staticUrl);

  const eventMapUrl =
    seatMap?.staticUrl ||
    null;

  return {
    id: event.id,

    name:
      event.name ||
      "Unnamed event",

    artist:
      artist ||
      null,

    venue:
      venue.name ||
      null,

    venueId:
      venue.id ||
      null,

    attractionIds:
      attractions
        .map(
          (attraction) =>
            attraction?.id
        )
        .filter(Boolean),

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

    localDate,
    localTime,

    eventUrl:
      event.url ||
      null,

    eventMapAvailable,
    eventMapUrl,

    status,
    rawStatus,

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

    source:
      event.source ||
      null,
  };
}

function normalizeStatus(rawStatus) {
  if (!rawStatus) {
    return "unknown";
  }

  const status =
    String(rawStatus).toLowerCase();

  switch (status) {
    case "onsale":
      return "available";

    case "offsale":
      return "unknown";

    case "canceled":
    case "cancelled":
      return "cancelled";

    case "postponed":
      return "postponed";

    case "rescheduled":
      return "postponed";

    case "soldout":
    case "sold_out":
      return "sold_out";

    default:
      return "unknown";
  }
}