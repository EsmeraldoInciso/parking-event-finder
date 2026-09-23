const DISCOVERY_FEED_METADATA_URL =
  "https://app.ticketmaster.com/discovery-feed/v2/events";

export async function getDiscoveryFeedMetadata({
  apiKey,
}) {
  if (!apiKey) {
    throw new Error("Missing Ticketmaster API key");
  }

  const url = new URL(
    DISCOVERY_FEED_METADATA_URL
  );

  url.searchParams.set(
    "apikey",
    apiKey
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const responseText =
    await response.text();

  let data = null;

  try {
    data = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    throw new Error(
      "Ticketmaster Discovery Feed metadata returned invalid JSON"
    );
  }

  if (!response.ok) {
    const error = new Error(
      `Ticketmaster Discovery Feed metadata request failed (${response.status})`
    );

    error.status =
      response.status;

    error.ticketmaster =
      data;

    throw error;
  }

  return data;
}

export function getCountryFeedMetadata(
  data,
  countryCode = "US"
) {
  if (!data?.countries) {
    return null;
  }

  const country =
    data.countries[
      countryCode.toUpperCase()
    ];

  if (!country) {
    return null;
  }

  /*
   * Current Ticketmaster feed metadata
   * exposes JSON and CSV entries.
   *
   * Prefer JSON.
   */
  return (
    country.JSON ||
    country.Json ||
    country.json ||
    null
  );
}