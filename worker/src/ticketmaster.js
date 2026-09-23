const TICKETMASTER_API_URL =
  "https://app.ticketmaster.com/discovery/v2/events.json";

const MAX_TICKETMASTER_PAGE_SIZE = 199;

export async function searchEvents({
  apiKey,
  countryCode,
  stateCode,
  city,
  dmaId,
  startDateTime,
  endDateTime,
  classificationName,
  keyword,
  source,
  venueId,
  attractionId,
  id,
  size = 20,
  page = 0,
  sort = "date,asc",
}) {
  if (!apiKey) {
    throw new Error("Missing Ticketmaster API key");
  }

  const url = new URL(TICKETMASTER_API_URL);

  url.searchParams.set("apikey", apiKey);

  if (countryCode) {
    url.searchParams.set("countryCode", countryCode);
  }

  if (stateCode) {
    url.searchParams.set("stateCode", stateCode);
  }

  if (city) {
    url.searchParams.set("city", city);
  }

  if (dmaId) {
    url.searchParams.set("dmaId", dmaId);
  }

  if (startDateTime) {
    url.searchParams.set(
      "startDateTime",
      startDateTime
    );
  }

  if (endDateTime) {
    url.searchParams.set(
      "endDateTime",
      endDateTime
    );
  }

  if (classificationName) {
    url.searchParams.set(
      "classificationName",
      classificationName
    );
  }

  if (keyword) {
    url.searchParams.set("keyword", keyword);
  }

  if (source) {
    url.searchParams.set("source", source);
  }

  if (venueId) {
    url.searchParams.set("venueId", venueId);
  }

  if (attractionId) {
    url.searchParams.set(
      "attractionId",
      attractionId
    );
  }

  if (id) {
    url.searchParams.set("id", id);
  }

  const safeSize = Math.min(
    Math.max(Number(size) || 20, 1),
    MAX_TICKETMASTER_PAGE_SIZE
  );

  const safePage = Math.max(
    Number(page) || 0,
    0
  );

  url.searchParams.set(
    "size",
    String(safeSize)
  );

  url.searchParams.set(
    "page",
    String(safePage)
  );

  if (sort) {
    url.searchParams.set(
      "sort",
      sort
    );
  }

  url.searchParams.set(
    "includeTBA",
    "no"
  );

  url.searchParams.set(
    "includeTBD",
    "no"
  );

  url.searchParams.set(
    "includeTest",
    "no"
  );

  const response = await fetch(
    url.toString()
  );

  const responseText =
    await response.text();

  let data = null;

  try {
    data = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      `Ticketmaster API request failed (${response.status})`
    );

    error.status = response.status;
    error.ticketmaster = data;

    error.url =
      url
        .toString()
        .replace(
          /apikey=[^&]+/,
          "apikey=REDACTED"
        );

    throw error;
  }

  return data || {};
}