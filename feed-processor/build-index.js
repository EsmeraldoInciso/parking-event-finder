import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import zlib from "node:zlib";

import streamChain from "stream-chain";
import streamJson from "stream-json";
import streamArrayModule from "stream-json/streamers/StreamArray.js";
import pickModule from "stream-json/filters/Pick.js";

const { chain } = streamChain;
const { parser } = streamJson;
const { streamArray } = streamArrayModule;
const { pick } = pickModule;

const API_KEY = process.env.TICKETMASTER_API_KEY;
const COUNTRY_CODE = (process.env.COUNTRY_CODE || "US").toUpperCase();

const DATA_DIR = path.resolve(process.cwd(), "../data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const PARKING_FILE = path.join(DATA_DIR, "parking.json");
const SEARCH_DIR = path.join(DATA_DIR, "search");

const METADATA_URL =
  "https://app.ticketmaster.com/discovery-feed/v2/events";

if (!API_KEY) {
  console.error("ERROR: TICKETMASTER_API_KEY is not set.");
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

function tokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function shardKey(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, "");
  if (!normalized) return "zz";
  return normalized.slice(0, 2).padEnd(2, "0");
}

function monthKey(date) {
  const value = String(date || "");
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "unknown";
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

const STRIP_PARKING_TERMS = [
  "parking pass",
  "parking permit",
  "parking",
  "pass",
  "permit",
  "prepaid",
  "event"
];

function getAttractions(event) {
  if (!Array.isArray(event?.attractions)) return [];

  return event.attractions
    .map((item) => item?.attraction || null)
    .filter(Boolean)
    .map((attraction) => ({
      id: attraction.attractionId || null,
      name: attraction.attractionName || attraction.name || null,
      url: attraction.attractionUrl || null
    }))
    .filter((item) => item.name);
}

function isParkingEvent(event) {
  if (!event) return false;

  const venue = event.venue || {};
  const attractionNames = getAttractions(event)
    .map((item) => item.name)
    .join(" ");

  const searchableText = normalizeText([
    event.eventName,
    event.eventInfo,
    event.eventNotes,
    venue.venueName,
    venue.venueCity,
    venue.venueStateCode,
    attractionNames
  ].join(" "));

  return PARKING_TERMS.some((term) =>
    searchableText.includes(normalizeText(term))
  );
}

function normalizeStatus(rawStatus) {
  const status = normalizeText(rawStatus);

  if (status === "onsale") return "available";
  if (status === "rescheduled") return "rescheduled";
  if (status === "postponed") return "postponed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "offsale") return "unknown";

  return status || "unknown";
}

function normalizeEvent(event) {
  const venue = event?.venue || {};
  const attractions = getAttractions(event);

  const searchableFields = [
    event?.eventName,
    event?.eventInfo,
    event?.eventNotes,
    venue?.venueName,
    venue?.venueCity,
    venue?.venueStateCode,
    ...attractions.map((item) => item.name)
  ];

  return {
    id: event?.eventId || null,
    legacyEventId: event?.legacyEventId || null,
    name: event?.eventName || null,
    eventUrl: event?.primaryEventUrl || null,
    resaleEventUrl: event?.resaleEventUrl || null,
    status: normalizeStatus(event?.eventStatus),
    rawStatus: event?.eventStatus || null,
    localDate: event?.eventStartLocalDate || null,
    localTime: event?.eventStartLocalTime || null,
    startDateTime: event?.eventStartDateTime || null,
    endDateTime: event?.eventEndDateTime || null,
    imageUrl: event?.eventImageUrl || null,
    venue: {
      id: venue?.venueId || null,
      name: venue?.venueName || null,
      city: venue?.venueCity || null,
      state: venue?.venueStateCode || null,
      country: venue?.venueCountryCode || null,
      latitude: venue?.venueLatitude ?? null,
      longitude: venue?.venueLongitude ?? null,
      street: venue?.venueStreet || null,
      zipCode: venue?.venueZipCode || null,
      timezone: venue?.venueTimezone || null
    },
    attractions,
    classification: {
      segment:
        event?.classifications?.[0]?.classification?.segment?.segmentName ||
        null,
      genre:
        event?.classifications?.[0]?.classification?.genre?.genreName ||
        null
    },
    searchText: normalizeText(searchableFields.join(" ")),
    parkingMatches: []
  };
}

function compactEvent(event) {
  return {
    id: event.id,
    name: event.name,
    eventUrl: event.eventUrl,
    status: event.status,
    localDate: event.localDate,
    localTime: event.localTime,
    startDateTime: event.startDateTime,
    venue: event.venue,
    attractions: event.attractions,
    classification: event.classification,
    parkingMatches: event.parkingMatches || []
  };
}

function compactParking(event) {
  return {
    id: event.id,
    name: event.name,
    eventUrl: event.eventUrl,
    status: event.status,
    localDate: event.localDate,
    localTime: event.localTime,
    startDateTime: event.startDateTime,
    venue: event.venue,
    attractions: event.attractions,
    matchedEventIds: event.matchedEventIds || []
  };
}

function stripParkingTerms(value) {
  let result = normalizeText(value);

  for (const term of STRIP_PARKING_TERMS) {
    result = result.replace(
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
      " "
    );
  }

  return result.replace(/\s+/g, " ").trim();
}

function scoreParkingMatch(parking, event) {
  if (!parking || !event) return 0;
  if (parking.id === event.id) return 0;

  let score = 0;

  if (
    parking.localDate &&
    event.localDate &&
    parking.localDate === event.localDate
  ) {
    score += 5;
  } else {
    return 0;
  }

  if (
    parking.venue?.id &&
    event.venue?.id &&
    parking.venue.id === event.venue.id
  ) {
    score += 6;
  }

  const parkingVenue = normalizeText(parking.venue?.name);
  const eventVenue = normalizeText(event.venue?.name);

  if (parkingVenue && eventVenue && parkingVenue === eventVenue) {
    score += 4;
  }

  const parkingCity = normalizeText(parking.venue?.city);
  const eventCity = normalizeText(event.venue?.city);

  if (parkingCity && eventCity && parkingCity === eventCity) {
    score += 2;
  }

  const eventAttractionIds = new Set(
    (event.attractions || [])
      .map((item) => item?.id)
      .filter(Boolean)
  );

  for (const attraction of parking.attractions || []) {
    if (attraction?.id && eventAttractionIds.has(attraction.id)) {
      score += 8;
      break;
    }
  }

  const eventText = normalizeText([
    event.name,
    ...(event.attractions || []).map((item) => item?.name)
  ].join(" "));

  const parkingText = stripParkingTerms([
    parking.name,
    ...(parking.attractions || []).map((item) => item?.name)
  ].join(" "));

  const parkingTokens = new Set(tokens(parkingText));
  const eventTokens = new Set(tokens(eventText));

  let overlap = 0;
  for (const token of parkingTokens) {
    if (eventTokens.has(token)) overlap++;
  }

  score += Math.min(overlap * 3, 12);

  return score;
}

function buildParkingMatches(events, parkingEvents) {
  const byDateVenue = new Map();
  const byDateCity = new Map();

  for (const event of events) {
    if (isParkingNormalized(event)) continue;

    const date = event.localDate;
    if (!date) continue;

    if (event.venue?.id) {
      const key = `${date}|venue:${event.venue.id}`;
      if (!byDateVenue.has(key)) byDateVenue.set(key, []);
      byDateVenue.get(key).push(event);
    }

    const city = normalizeText(event.venue?.city);
    if (city) {
      const key = `${date}|city:${city}`;
      if (!byDateCity.has(key)) byDateCity.set(key, []);
      byDateCity.get(key).push(event);
    }
  }

  const allParking = [];

  for (const parking of parkingEvents) {
    const candidateMap = new Map();

    if (parking.localDate && parking.venue?.id) {
      const key = `${parking.localDate}|venue:${parking.venue.id}`;
      for (const event of byDateVenue.get(key) || []) {
        candidateMap.set(event.id, event);
      }
    }

    if (candidateMap.size === 0 && parking.localDate) {
      const city = normalizeText(parking.venue?.city);
      if (city) {
        const key = `${parking.localDate}|city:${city}`;
        for (const event of byDateCity.get(key) || []) {
          candidateMap.set(event.id, event);
        }
      }
    }

    const scored = [...candidateMap.values()]
      .map((event) => ({
        event,
        score: scoreParkingMatch(parking, event)
      }))
      .filter((item) => item.score >= 8)
      .sort((a, b) => b.score - a.score);

    const selected =
      scored.length === 1
        ? scored
        : scored.filter((item) => item.score >= Math.max(8, scored[0]?.score - 2));

    const uniqueSelected = [];
    const seen = new Set();

    for (const item of selected) {
      if (seen.has(item.event.id)) continue;
      seen.add(item.event.id);
      uniqueSelected.push(item);
      if (uniqueSelected.length >= 5) break;
    }

    const parkingSummary = {
      id: parking.id,
      name: parking.name,
      eventUrl: parking.eventUrl,
      localDate: parking.localDate,
      localTime: parking.localTime,
      venue: parking.venue
    };

    parking.matchedEventIds = uniqueSelected.map((item) => item.event.id);

    for (const item of uniqueSelected) {
      item.event.parkingMatches.push(parkingSummary);
    }

    allParking.push(parking);
  }

  return allParking;
}

function isParkingNormalized(event) {
  return PARKING_TERMS.some((term) =>
    normalizeText(event?.name).includes(normalizeText(term))
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}\n${text.slice(0, 1000)}`
    );
  }

  return JSON.parse(text);
}

async function discoverFeed() {
  const url = new URL(METADATA_URL);
  url.searchParams.set("apikey", API_KEY);

  const metadata = await fetchJson(url.toString());
  const country = metadata?.countries?.[COUNTRY_CODE];

  if (!country) {
    throw new Error(`No Discovery Feed found for country ${COUNTRY_CODE}.`);
  }

  const feed = country.JSON || country.Json || country.json;

  if (!feed?.uri) {
    throw new Error(`No JSON feed URI found for ${COUNTRY_CODE}.`);
  }

  console.log(`Feed URI: ${feed.uri}`);
  console.log(`Feed size: ${feed.compressed_size_bytes} bytes`);
  console.log(`Expected events: ${feed.num_events}`);
  console.log(`Last updated: ${feed.last_updated}`);

  return feed;
}

function httpsStream(url) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          "User-Agent": "Ticketmaster-Parking-Feed-Processor/2.0"
        }
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          httpsStream(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Feed download failed with HTTP ${response.statusCode}`
            )
          );
          return;
        }

        resolve(response);
      }
    ).on("error", reject);
  });
}

async function processFeed(feed) {
  console.log("Downloading and streaming Ticketmaster feed...");

  const response = await httpsStream(feed.uri);
  const gzip = zlib.createGunzip();

  const events = [];
  const parkingEvents = [];

  let processed = 0;
  let parkingCount = 0;

  const pipelineStream = chain([
    response,
    gzip,
    parser(),
    pick({ filter: "events" }),
    streamArray()
  ]);

  for await (const item of pipelineStream) {
    const raw = item.value;
    const normalized = normalizeEvent(raw);

    if (!normalized.id && !normalized.eventUrl) {
      continue;
    }

    events.push(normalized);

    if (isParkingEvent(raw)) {
      parkingEvents.push(normalized);
      parkingCount++;
    }

    processed++;

    if (processed % 10000 === 0) {
      console.log(
        `Processed ${processed} events; parking events: ${parkingCount}`
      );
    }
  }

  console.log(`Finished processing ${processed} events.`);
  console.log(`Parking events found: ${parkingCount}`);

  return {
    events,
    parkingEvents
  };
}

function dedupeEvents(events) {
  const seen = new Set();
  const result = [];

  for (const event of events) {
    const key = event.id || event.eventUrl;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }

  return result;
}

function sortEvents(events) {
  return events.sort((a, b) => {
    const left = `${a.localDate || ""} ${a.localTime || ""}`;
    const right = `${b.localDate || ""} ${b.localTime || ""}`;
    return left.localeCompare(right);
  });
}

function ensureCleanSearchDir() {
  fs.rmSync(SEARCH_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEARCH_DIR, { recursive: true });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
}

function addToBucket(map, key, record) {
  if (!map.has(key)) map.set(key, new Map());

  const bucket = map.get(key);
  const id = record.id;

  if (id && !bucket.has(id)) {
    bucket.set(id, record);
  }
}

function buildSearchIndexes(events, parkingEvents) {
  ensureCleanSearchDir();

  const eventName = new Map();
  const eventAttraction = new Map();
  const eventCity = new Map();
  const eventState = new Map();
  const eventMonth = new Map();

  const parkingName = new Map();
  const parkingAttraction = new Map();
  const parkingCity = new Map();
  const parkingState = new Map();
  const parkingMonth = new Map();

  for (const event of events) {
    const compact = compactEvent(event);

    const firstNameToken = tokens(event.name)[0];
    if (firstNameToken) {
      addToBucket(eventName, shardKey(firstNameToken), compact);
    }

    const attractionTokenSet = new Set();
    for (const attraction of event.attractions || []) {
      for (const token of tokens(attraction.name)) {
        attractionTokenSet.add(shardKey(token));
      }
    }

    for (const key of attractionTokenSet) {
      addToBucket(eventAttraction, key, compact);
    }

    if (event.venue?.city) {
      addToBucket(eventCity, shardKey(event.venue.city), compact);
    }

    if (event.venue?.state) {
      addToBucket(eventState, normalizeText(event.venue.state), compact);
    }

    if (event.localDate) {
      addToBucket(eventMonth, monthKey(event.localDate), compact);
    }
  }

  for (const event of parkingEvents) {
    const compact = compactParking(event);

    const firstNameToken = tokens(event.name)[0];
    if (firstNameToken) {
      addToBucket(parkingName, shardKey(firstNameToken), compact);
    }

    const attractionTokenSet = new Set();
    for (const attraction of event.attractions || []) {
      for (const token of tokens(attraction.name)) {
        attractionTokenSet.add(shardKey(token));
      }
    }

    for (const key of attractionTokenSet) {
      addToBucket(parkingAttraction, key, compact);
    }

    if (event.venue?.city) {
      addToBucket(parkingCity, shardKey(event.venue.city), compact);
    }

    if (event.venue?.state) {
      addToBucket(parkingState, normalizeText(event.venue.state), compact);
    }

    if (event.localDate) {
      addToBucket(parkingMonth, monthKey(event.localDate), compact);
    }
  }

  function writeBuckets(base, buckets) {
    for (const [key, map] of buckets) {
      const records = [...map.values()];
      records.sort((a, b) => {
        const left = `${a.localDate || ""} ${a.localTime || ""}`;
        const right = `${b.localDate || ""} ${b.localTime || ""}`;
        return left.localeCompare(right);
      });

      writeJson(
        path.join(SEARCH_DIR, base, `${key}.json`),
        {
          generatedAt: new Date().toISOString(),
          count: records.length,
          events: records
        }
      );
    }
  }

  writeBuckets("events/name", eventName);
  writeBuckets("events/attraction", eventAttraction);
  writeBuckets("events/city", eventCity);
  writeBuckets("events/state", eventState);
  writeBuckets("events/month", eventMonth);

  writeBuckets("parking/name", parkingName);
  writeBuckets("parking/attraction", parkingAttraction);
  writeBuckets("parking/city", parkingCity);
  writeBuckets("parking/state", parkingState);
  writeBuckets("parking/month", parkingMonth);

  const manifest = {
    generatedAt: new Date().toISOString(),
    countryCode: COUNTRY_CODE,
    eventCount: events.length,
    parkingCount: parkingEvents.length,
    indexes: {
      events: [
        "name",
        "attraction",
        "city",
        "state",
        "month"
      ],
      parking: [
        "name",
        "attraction",
        "city",
        "state",
        "month"
      ]
    }
  };

  writeJson(path.join(SEARCH_DIR, "manifest.json"), manifest);
}

function createArchive(events, parkingEvents, feed) {
  const uniqueEvents = sortEvents(dedupeEvents(events));
  const uniqueParking = sortEvents(dedupeEvents(parkingEvents));

  const generatedAt = new Date().toISOString();

  const eventsOutput = {
    generatedAt,
    source: "Ticketmaster Discovery Feed",
    countryCode: COUNTRY_CODE,
    feed: {
      lastUpdated: feed.last_updated || null,
      numberOfEvents: Number(feed.num_events || 0),
      compressedSizeBytes: Number(feed.compressed_size_bytes || 0),
      checksum: feed.compressed_md5_checksum || null
    },
    summary: {
      totalEvents: uniqueEvents.length,
      parkingEvents: uniqueParking.length,
      eventsWithParkingMatches: uniqueEvents.filter(
        (event) => event.parkingMatches?.length
      ).length
    },
    events: uniqueEvents
  };

  const parkingOutput = {
    generatedAt,
    source: "Ticketmaster Discovery Feed",
    countryCode: COUNTRY_CODE,
    feed: eventsOutput.feed,
    summary: {
      parkingEvents: uniqueParking.length,
      parkingEventsWithMatchedEvents: uniqueParking.filter(
        (event) => event.matchedEventIds?.length
      ).length
    },
    events: uniqueParking
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Pretty JSON makes the complete archive easier to inspect locally.
  // The searchable shards remain compact/minified.
  fs.writeFileSync(
    EVENTS_FILE,
    JSON.stringify(eventsOutput, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    PARKING_FILE,
    JSON.stringify(parkingOutput, null, 2),
    "utf8"
  );

  return {
    events: uniqueEvents,
    parking: uniqueParking
  };
}

async function main() {
  const feed = await discoverFeed();
  const processed = await processFeed(feed);

  const events = dedupeEvents(processed.events);
  const parkingEvents = dedupeEvents(processed.parkingEvents);

  console.log("Matching parking events back to complete events...");
  const matchedParking = buildParkingMatches(events, parkingEvents);

  const archives = createArchive(events, matchedParking, feed);
  buildSearchIndexes(archives.events, archives.parking);

  const eventsSize = fs.statSync(EVENTS_FILE).size;
  const parkingSize = fs.statSync(PARKING_FILE).size;

  console.log(`Complete events: ${archives.events.length}`);
  console.log(`Parking events: ${archives.parking.length}`);
  console.log(`events.json: ${eventsSize} bytes`);
  console.log(`parking.json: ${parkingSize} bytes`);

  if (eventsSize >= 95 * 1024 * 1024) {
    throw new Error(
      "events.json is >= 95 MiB. GitHub's normal repository file limit is 100 MiB; reduce the archive before publishing."
    );
  }

  const matchedEvents = archives.events.filter(
    (event) => event.parkingMatches?.length
  ).length;

  console.log(`Events with parking matches: ${matchedEvents}`);

  const olivia = archives.events.filter((event) =>
    normalizeText([
      event.name,
      ...(event.attractions || []).map((item) => item.name),
      event.venue?.name
    ].join(" ")).includes("olivia")
  );

  const metallica = archives.events.filter((event) =>
    normalizeText([
      event.name,
      ...(event.attractions || []).map((item) => item.name),
      event.venue?.name
    ].join(" ")).includes("metallica")
  );

  console.log(
    `Validation: Olivia-related events=${olivia.length}, with parking match=${olivia.filter((event) => event.parkingMatches?.length).length}`
  );

  console.log(
    `Validation: Metallica-related events=${metallica.length}, with parking match=${metallica.filter((event) => event.parkingMatches?.length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
