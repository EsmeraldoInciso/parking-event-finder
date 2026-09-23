import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";

import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray.js";

const API_KEY =
  process.env.TICKETMASTER_API_KEY;

const COUNTRY_CODE =
  process.env.COUNTRY_CODE || "US";

const OUTPUT_FILE =
  process.env.OUTPUT_FILE ||
  path.resolve(
    process.cwd(),
    "../data/parking.json"
  );

const METADATA_URL =
  "https://app.ticketmaster.com/discovery-feed/v2/events";

if (!API_KEY) {
  console.error(
    "ERROR: TICKETMASTER_API_KEY is not set."
  );

  process.exit(1);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PARKING_TERMS = [
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
  "tailgate parking"
];

function isParkingEvent(event) {
  if (!event) {
    return false;
  }

  const attractionNames =
    Array.isArray(event.attractions)
      ? event.attractions
          .map(
            (item) =>
              item?.attraction
                ?.attractionName ||
              item?.attraction
                ?.name ||
              ""
          )
          .join(" ")
      : "";

  const venue = event.venue || {};

  const searchableText =
    normalizeText(
      [
        event.eventName,
        event.eventInfo,
        event.eventNotes,
        venue.venueName,
        venue.venueCity,
        venue.venueStateCode,
        attractionNames
      ].join(" ")
    );

  return PARKING_TERMS.some(
    (term) =>
      searchableText.includes(
        normalizeText(term)
      )
  );
}

function getAttractions(event) {
  if (
    !Array.isArray(
      event?.attractions
    )
  ) {
    return [];
  }

  return event.attractions
    .map(
      (item) =>
        item?.attraction || null
    )
    .filter(Boolean)
    .map((attraction) => ({
      id:
        attraction.attractionId ||
        null,

      name:
        attraction.attractionName ||
        attraction.name ||
        null,

      url:
        attraction.attractionUrl ||
        null
    }))
    .filter(
      (attraction) =>
        attraction.name
    );
}

function normalizeEvent(event) {
  const venue =
    event.venue || {};

  const attractions =
    getAttractions(event);

  const attractionNames =
    attractions
      .map(
        (attraction) =>
          attraction.name
      )
      .filter(Boolean);

  const searchableFields = [
    event.eventName,
    event.eventInfo,
    event.eventNotes,

    venue.venueName,
    venue.venueCity,
    venue.venueStateCode,
    venue.venueCountryCode,

    ...attractionNames
  ];

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

    endDateTime:
      event.eventEndDateTime ||
      null,

    imageUrl:
      event.eventImageUrl ||
      null,

    venue: {
      id:
        venue.venueId ||
        null,

      name:
        venue.venueName ||
        null,

      city:
        venue.venueCity ||
        null,

      state:
        venue.venueStateCode ||
        null,

      country:
        venue.venueCountryCode ||
        null,

      latitude:
        venue.venueLatitude ??
        null,

      longitude:
        venue.venueLongitude ??
        null,

      street:
        venue.venueStreet ||
        null,

      zipCode:
        venue.venueZipCode ||
        null,

      timezone:
        venue.venueTimezone ||
        null
    },

    attractions,

    searchText:
      normalizeText(
        searchableFields.join(" ")
      )
  };
}

async function fetchJson(url) {
  const response =
    await fetch(url);

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}\n${text.slice(
        0,
        1000
      )}`
    );
  }

  return JSON.parse(text);
}

async function discoverFeed() {
  console.log(
    "Discovering current Ticketmaster feed..."
  );

  const url =
    new URL(METADATA_URL);

  url.searchParams.set(
    "apikey",
    API_KEY
  );

  const metadata =
    await fetchJson(
      url.toString()
    );

  const countries =
    metadata?.countries;

  if (!countries) {
    throw new Error(
      "Ticketmaster feed metadata did not contain countries."
    );
  }

  const country =
    countries[
      COUNTRY_CODE.toUpperCase()
    ];

  if (!country) {
    throw new Error(
      `No feed found for country ${COUNTRY_CODE}.`
    );
  }

  const feed =
    country.JSON ||
    country.Json ||
    country.json;

  if (!feed) {
    throw new Error(
      `No JSON feed found for ${COUNTRY_CODE}.`
    );
  }

  console.log(
    `Feed URI: ${feed.uri}`
  );

  console.log(
    `Feed size: ${feed.compressed_size_bytes} bytes`
  );

  console.log(
    `Expected events: ${feed.num_events}`
  );

  console.log(
    `Last updated: ${feed.last_updated}`
  );

  return feed;
}

function httpsStream(url) {
  return new Promise(
    (resolve, reject) => {
      https.get(
        url,
        {
          headers: {
            "User-Agent":
              "Ticketmaster-Parking-Feed-Processor/1.0"
          }
        },
        (response) => {
          /*
           * Follow redirects.
           */
          if (
            response.statusCode >=
              300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();

            httpsStream(
              response.headers.location
            )
              .then(resolve)
              .catch(reject);

            return;
          }

          if (
            response.statusCode !==
            200
          ) {
            reject(
              new Error(
                `Feed download failed with HTTP ${response.statusCode}`
              )
            );

            response.resume();

            return;
          }

          resolve(response);
        }
      ).on(
        "error",
        reject
      );
    }
  );
}

async function processFeed(
  feed
) {
  console.log(
    "Downloading and streaming feed..."
  );

  const response =
    await httpsStream(
      feed.uri
    );

  const gzip =
    zlib.createGunzip();

  const results = [];

  let processed =
    0;

  let parking =
    0;

  const pipelineStream =
    chain([
      response,
      gzip,
      parser(),
      streamArray()
    ]);

  for await (
    const item of pipelineStream
  ) {
    const event =
      item.value;

    processed++;

    if (
      isParkingEvent(event)
    ) {
      const normalized =
        normalizeEvent(
          event
        );

      if (
        normalized.id ||
        normalized.eventUrl
      ) {
        results.push(
          normalized
        );

        parking++;
      }
    }

    if (
      processed % 10000 ===
      0
    ) {
      console.log(
        `Processed ${processed} events; parking events: ${parking}`
      );
    }
  }

  console.log(
    `Finished processing ${processed} events.`
  );

  console.log(
    `Parking events found: ${parking}`
  );

  return results;
}

function sortParkingEvents(
  events
) {
  return events.sort(
    (a, b) => {
      const dateA =
        `${a.localDate || ""} ${
          a.localTime || ""
        }`;

      const dateB =
        `${b.localDate || ""} ${
          b.localTime || ""
        }`;

      return dateA.localeCompare(
        dateB
      );
    }
  );
}

async function main() {
  const feed =
    await discoverFeed();

  const events =
    await processFeed(
      feed
    );

  const unique =
    new Map();

  for (
    const event of events
  ) {
    const key =
      event.id ||
      event.eventUrl;

    if (!key) {
      continue;
    }

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        event
      );
    }
  }

  const parkingEvents =
    sortParkingEvents(
      Array.from(
        unique.values()
      )
    );

  const output = {
    generatedAt:
      new Date().toISOString(),

    source:
      "Ticketmaster Discovery Feed",

    countryCode:
      COUNTRY_CODE,

    feed: {
      lastUpdated:
        feed.last_updated ||
        null,

      numberOfEvents:
        Number(
          feed.num_events ||
          0
        ),

      compressedSizeBytes:
        Number(
          feed.compressed_size_bytes ||
          0
        ),

      checksum:
        feed.compressed_md5_checksum ||
        null
    },

    summary: {
      parkingEvents:
        parkingEvents.length
    },

    events:
      parkingEvents
  };

  fs.mkdirSync(
    path.dirname(
      OUTPUT_FILE
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Wrote ${parkingEvents.length} parking events to ${OUTPUT_FILE}`
  );
}

main().catch(
  (error) => {
    console.error(
      error
    );

    process.exit(1);
  }
);