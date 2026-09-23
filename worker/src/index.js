const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const CACHE_TTL_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    try {
      if (
        request.method ===
        "OPTIONS"
      ) {
        return new Response(
          null,
          {
            status: 204,
            headers:
              corsHeaders()
          }
        );
      }

      const url =
        new URL(
          request.url
        );

      const pathname =
        url.pathname;

      if (
        pathname === "/" ||
        pathname === "/health"
      ) {
        return jsonResponse({
          success: true,

          service:
            "Ticketmaster Parking Event Finder",

          source:
            "Ticketmaster Discovery Feed",

          index:
            "GitHub-generated parking index"
        });
      }

      if (
        pathname === "/parking" ||
        pathname === "/events"
      ) {
        return handleParkingSearch(
          url,
          env,
          ctx
        );
      }

      if (
        pathname === "/stats"
      ) {
        return handleStats(
          env,
          ctx
        );
      }

      return jsonResponse(
        {
          success: false,
          error:
            "Not found"
        },
        404
      );
    } catch (error) {
      console.error(
        error
      );

      return jsonResponse(
        {
          success: false,

          error:
            error?.message ||
            "Unexpected server error"
        },
        500
      );
    }
  }
};


/* =========================================================
   PARKING SEARCH
   ========================================================= */

async function handleParkingSearch(
  url,
  env,
  ctx
) {
  const index =
    await loadParkingIndex(
      env,
      ctx
    );

  const keyword =
    (
      url.searchParams.get(
        "keyword"
      ) || ""
    ).trim();

  const city =
    (
      url.searchParams.get(
        "city"
      ) || ""
    ).trim();

  const state =
    (
      url.searchParams.get(
        "stateCode"
      ) || ""
    ).trim();

  const startDate =
    (
      url.searchParams.get(
        "startDate"
      ) || ""
    ).trim();

  const endDate =
    (
      url.searchParams.get(
        "endDate"
      ) || ""
    ).trim();

  const requestedLimit =
    Number(
      url.searchParams.get(
        "limit"
      )
    ) ||
    DEFAULT_LIMIT;

  const limit =
    Math.min(
      Math.max(
        requestedLimit,
        1
      ),
      MAX_LIMIT
    );

  const offset =
    Math.max(
      Number(
        url.searchParams.get(
          "offset"
        )
      ) || 0,
      0
    );

  const filtered =
    index.events.filter(
      (event) => {
        if (
          keyword &&
          !matchesKeyword(
            event,
            keyword
          )
        ) {
          return false;
        }

        if (
          city &&
          normalizeText(
            event.venue?.city
          ) !==
            normalizeText(
              city
            )
        ) {
          return false;
        }

        if (
          state &&
          normalizeText(
            event.venue?.state
          ) !==
            normalizeText(
              state
            )
        ) {
          return false;
        }

        if (
          startDate &&
          event.localDate &&
          event.localDate <
            startDate
        ) {
          return false;
        }

        if (
          endDate &&
          event.localDate &&
          event.localDate >
            endDate
        ) {
          return false;
        }

        return true;
      }
    );

  const results =
    filtered.slice(
      offset,
      offset + limit
    );

  return jsonResponse({
    success: true,

    query: {
      keyword:
        keyword || null,

      city:
        city || null,

      stateCode:
        state || null,

      startDate:
        startDate || null,

      endDate:
        endDate || null,

      offset,

      limit
    },

    summary: {
      indexEvents:
        index.events.length,

      matchingEvents:
        filtered.length,

      returned:
        results.length
    },

    feed: {
      generatedAt:
        index.generatedAt ||
        null,

      lastUpdated:
        index.feed?.lastUpdated ||
        null,

      countryCode:
        index.countryCode ||
        "US"
    },

    parkingEvents:
      results
  });
}


/* =========================================================
   STATS
   ========================================================= */

async function handleStats(
  env,
  ctx
) {
  const index =
    await loadParkingIndex(
      env,
      ctx
    );

  return jsonResponse({
    success: true,

    generatedAt:
      index.generatedAt ||
      null,

    source:
      index.source ||
      null,

    countryCode:
      index.countryCode ||
      null,

    feed:
      index.feed ||
      null,

    summary:
      index.summary ||
      {
        parkingEvents:
          index.events.length
      }
  });
}


/* =========================================================
   INDEX LOADING
   ========================================================= */

async function loadParkingIndex(
  env,
  ctx
) {
  const indexUrl =
    env.PARKING_INDEX_URL;

  if (!indexUrl) {
    throw new Error(
      "PARKING_INDEX_URL is not configured"
    );
  }

  const cache =
    caches.default;

  const cacheKey =
    new Request(
      indexUrl,
      {
        method: "GET"
      }
    );

  let response =
    await cache.match(
      cacheKey
    );

  if (response) {
    return response.json();
  }

  response =
    await fetch(
      indexUrl,
      {
        headers: {
          Accept:
            "application/json"
        },

        cf: {
          cacheTtl:
            CACHE_TTL_SECONDS,

          cacheEverything:
            true
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Parking index request failed (${response.status})`
    );
  }

  /*
   * Cache a clone so the user
   * request can immediately read
   * the original response.
   */
  const responseForCache =
    response.clone();

  ctx.waitUntil(
    cache.put(
      cacheKey,
      responseForCache
    )
  );

  return response.json();
}


/* =========================================================
   SEARCH
   ========================================================= */

function matchesKeyword(
  event,
  keyword
) {
  const normalizedKeyword =
    normalizeText(
      keyword
    );

  if (
    !normalizedKeyword
  ) {
    return true;
  }

  /*
   * First search the prebuilt
   * searchText.
   */
  if (
    normalizeText(
      event.searchText
    ).includes(
      normalizedKeyword
    )
  ) {
    return true;
  }

  /*
   * Extra defensive matching
   * in case searchText is missing.
   */
  const attractionText =
    Array.isArray(
      event.attractions
    )
      ? event.attractions
          .map(
            (item) =>
              item?.name || ""
          )
          .join(" ")
      : "";

  const fallbackText =
    [
      event.name,

      event.venue?.name,

      event.venue?.city,

      event.venue?.state,

      attractionText
    ].join(" ");

  return normalizeText(
    fallbackText
  ).includes(
    normalizedKeyword
  );
}


/* =========================================================
   TEXT NORMALIZATION
   ========================================================= */

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


/* =========================================================
   RESPONSE
   ========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Cache-Control":
      "no-store"
  };
}

function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        ...corsHeaders()
      }
    }
  );
}