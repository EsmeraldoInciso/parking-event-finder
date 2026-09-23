const searchForm = document.getElementById("searchForm");

const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

const searchButton = document.getElementById("searchButton");
const clearButton = document.getElementById("clearButton");

const statusArea = document.getElementById("statusArea");

const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const resultsContainer = document.getElementById("resultsContainer");

const resultsSummary = document.getElementById("resultsSummary");
const resultCount = document.getElementById("resultCount");

const pagination = document.getElementById("pagination");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const pageInfo = document.getElementById("pageInfo");
const API_BASE_URL =
  "https://parking-event-finder-api.esmeraldoinciso-main.workers.dev";

let currentPage = 0;
const pageSize = 25;

function getDefaultDates() {
  const today = new Date();

  const end = new Date(today);
  end.setMonth(end.getMonth() + 4);

  return {
    start: formatDate(today),
    end: formatDate(end),
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function initializeDates() {
  const dates = getDefaultDates();

  startDateInput.value = dates.start;
  endDateInput.value = dates.end;
}

function showStatus(message, type = "error") {
  statusArea.textContent = message;
  statusArea.className = `status-area ${type}`;
}

function hideStatus() {
  statusArea.textContent = "";
  statusArea.className = "status-area hidden";
}

function setLoading(isLoading) {
  loading.classList.toggle("hidden", !isLoading);

  searchButton.disabled = isLoading;

  if (isLoading) {
    emptyState.classList.add("hidden");
    resultsContainer.classList.add("hidden");
    pagination.classList.add("hidden");
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEventDate(date) {
  if (!date) {
    return "Unknown date";
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatEventTime(time) {
  if (!time) {
    return "Time unknown";
  }

  const parsed = new Date(`1970-01-01T${time}`);

  if (Number.isNaN(parsed.getTime())) {
    return time;
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusBadge(status) {
  const normalized =
    String(status || "unknown").toLowerCase();

  const labels = {
    available: "Currently On Sale",
    cancelled: "Cancelled",
    postponed: "Postponed",
    sold_out: "Sold Out",
    unknown: "Availability Unknown",
  };

  const label =
    labels[normalized] ||
    "Availability Unknown";

  const cssClass =
    [
      "available",
      "cancelled",
      "postponed",
      "sold_out",
      "unknown",
    ].includes(normalized)
      ? normalized
      : "unknown";

  return `
    <span class="badge badge-${escapeHtml(cssClass)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderEvent(event) {
  const artist =
    event.artist ||
    "Artist not specified";

  const locationParts = [
    event.venue,
    event.city,
    event.state,
    event.country,
  ].filter(Boolean);

  const location =
    locationParts.join(", ");

  const classification = [
    event.classification?.segment,
    event.classification?.genre,
  ]
    .filter(Boolean)
    .join(" / ");

  const priority =
    getPriority(event);

  const mapIndicator =
    event.eventMapAvailable === true
      ? `
        <div class="map-indicator">
          ✓ Event map available
        </div>
      `
      : `
        <div class="map-indicator">
          Event map status unknown
        </div>
      `;

  const ticketLink =
    event.eventUrl
      ? `
        <a
          href="${escapeHtml(event.eventUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ticketmaster
        </a>
      `
      : "";

  const mapLink =
    event.eventMapAvailable &&
    event.eventMapUrl
      ? `
        <a
          href="${escapeHtml(event.eventMapUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          class="secondary"
        >
          Event Map
        </a>
      `
      : "";

  return `
    <article
      class="event-card"
      data-event-id="${escapeHtml(event.id)}"
    >

      <div class="event-card-header">

        <div>
          <h3 class="event-title">
            ${escapeHtml(event.name)}
          </h3>

          <div class="event-artist">
            ${escapeHtml(artist)}
          </div>
        </div>

        <div>
          ${getStatusBadge(event.status)}
        </div>

      </div>

      <div style="margin-top: 10px;">
        <span
          class="priority-indicator priority-${priority.level}"
          title="${escapeHtml(priority.reason)}"
        >
          ${escapeHtml(priority.label)}
        </span>
      </div>

      <div class="event-meta">

        <div class="meta-item">
          <span class="meta-label">Date</span>
          <span class="meta-value">
            ${escapeHtml(
              formatEventDate(event.localDate)
            )}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-label">Time</span>
          <span class="meta-value">
            ${escapeHtml(
              formatEventTime(event.localTime)
            )}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-label">Venue</span>
          <span class="meta-value">
            ${escapeHtml(
              event.venue || "Unknown"
            )}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-label">Location</span>
          <span class="meta-value">
            ${escapeHtml(
              location || "Unknown"
            )}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-label">
            Classification
          </span>

          <span class="meta-value">
            ${escapeHtml(
              classification || "Unknown"
            )}
          </span>
        </div>

        <div class="meta-item">
          <span class="meta-label">
            Source
          </span>

          <span class="meta-value">
            ${escapeHtml(
              event.source || "Unknown"
            )}
          </span>
        </div>

      </div>

      ${mapIndicator}

      <div class="event-actions">
        ${ticketLink}
        ${mapLink}
      </div>

      ${renderParkingSection(event)}

    </article>
  `;
}

function renderResults(data) {
  const events = Array.isArray(data.events)
    ? data.events
    : [];

  const meta = data.meta || {};

  resultCount.textContent =
    `${events.length} event${events.length === 1 ? "" : "s"}`;

  resultsSummary.textContent =
    `Received ${meta.received ?? events.length} event${
      (meta.received ?? events.length) === 1 ? "" : "s"
    } from Ticketmaster.`;

  if (events.length === 0) {
    resultsContainer.classList.add("hidden");
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `
      <h3>No matching events</h3>
      <p>
        Try expanding your date range or removing one of the filters.
      </p>
    `;

    pagination.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  resultsContainer.innerHTML = events
    .map(renderEvent)
    .join("");

  attachResearchHandlers();

  resultsContainer.classList.remove("hidden");

  updatePagination(meta);
}

function updatePagination(meta) {
  const page = Number(meta.page ?? currentPage);
  const size = Number(meta.size ?? pageSize);

  const received = Number(meta.received ?? 0);

  const hasPrevious = page > 0;

  /*
   * The Worker currently returns a page of results.
   * If fewer than pageSize results are returned,
   * there is normally no next page.
   */
  const hasNext = received >= size;

  previousButton.disabled = !hasPrevious;
  nextButton.disabled = !hasNext;

  pageInfo.textContent = `Page ${page + 1}`;

  pagination.classList.remove("hidden");
}

function buildQuery(page = 0) {
  const params = new URLSearchParams();

  params.set("startDate", startDateInput.value);
  params.set("endDate", endDateInput.value);

  const fields = [
    "countryCode",
    "stateCode",
    "city",
    "classificationName",
    "keyword",
  ];

  for (const field of fields) {
    const element = document.getElementById(field);

    if (element && element.value.trim()) {
      params.set(field, element.value.trim());
    }
  }

  params.set("size", String(pageSize));
  params.set("page", String(page));

  return params;
}

async function searchEvents(page = 0) {
  hideStatus();

  if (!startDateInput.value || !endDateInput.value) {
    showStatus("Please select both start and end dates.");
    return;
  }

  if (startDateInput.value > endDateInput.value) {
    showStatus("Start date cannot be after end date.");
    return;
  }

  currentPage = page;

  setLoading(true);

  try {
    const query = buildQuery(page);

    const response = await fetch(
      `${API_BASE_URL}/events?${query.toString()}`
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Worker returned an invalid response (${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Request failed with status ${response.status}.`
      );
    }

    if (!data.success) {
      throw new Error(
        data.message ||
        data.error ||
        "The Worker did not complete the search."
      );
    }

    renderResults(data);

    showStatus(
      `Search completed successfully. Found ${data.events?.length || 0} matching event(s).`,
      "success"
    );

  } catch (error) {
    console.error(error);

    resultsContainer.classList.add("hidden");
    pagination.classList.add("hidden");
    emptyState.classList.remove("hidden");

    emptyState.innerHTML = `
      <h3>Search failed</h3>
      <p>
        ${escapeHtml(error.message)}
      </p>
    `;

    showStatus(
      error.message || "Unable to search for events.",
      "error"
    );

  } finally {
    setLoading(false);
  }
}

function clearSearch() {
  searchForm.reset();

  initializeDates();

  hideStatus();

  resultsContainer.innerHTML = "";
  resultsContainer.classList.add("hidden");

  pagination.classList.add("hidden");

  emptyState.classList.remove("hidden");

  emptyState.innerHTML = `
    <h3>No events loaded</h3>
    <p>
      Enter your search criteria and click
      <strong>Search Events</strong>.
    </p>
  `;

  resultCount.textContent = "";
  resultsSummary.textContent =
    "Search for events to begin.";

  currentPage = 0;
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  searchEvents(0);
});

clearButton.addEventListener("click", clearSearch);

previousButton.addEventListener("click", () => {
  if (currentPage > 0) {
    searchEvents(currentPage - 1);
  }
});

nextButton.addEventListener("click", () => {
  searchEvents(currentPage + 1);
});

initializeDates();


const RESEARCH_STORAGE_KEY =
  "ticketmaster-parking-research";

function loadResearch() {
  try {
    const saved =
      localStorage.getItem(RESEARCH_STORAGE_KEY);

    if (!saved) {
      return {};
    }

    return JSON.parse(saved);
  } catch (error) {
    console.error(
      "Unable to load parking research:",
      error
    );

    return {};
  }
}

function saveAllResearch(research) {
  localStorage.setItem(
    RESEARCH_STORAGE_KEY,
    JSON.stringify(research)
  );
}

function getEventResearch(eventId) {
  const research = loadResearch();

  return (
    research[eventId] || {
      parkingFound: "unknown",

      parkingTypes: {
        general: false,
        standard: false,
        vip: false,
        premium: false,
        prepaid: false,
        package: false,
      },

      parkingPrice: "",

      parkingListingUrl: "",

      parkingNotes: "",

      researched: false,

      lastChecked: null,
    }
  );
}



function getPriority(event) {
  /*
   * Cancelled events are excluded from research priority.
   */
  if (event.status === "cancelled") {
    return {
      level: "excluded",
      label: "Excluded",
      reason: "Event is cancelled.",
    };
  }

  /*
   * Sold-out events are not automatically treated
   * as unavailable unless the API reliably identifies them.
   */
  if (event.status === "sold_out") {
    return {
      level: "excluded",
      label: "Excluded",
      reason: "Event is identified as sold out.",
    };
  }

  const research =
    getEventResearch(event.id);

  /*
   * High-priority conditions from the plan:
   *
   * - future event
   * - Ticketmaster source
   * - not sold out
   * - event map available
   * - parking research not completed
   */
  if (
    event.source?.toLowerCase() ===
      "ticketmaster" &&
    event.status !== "sold_out" &&
    event.eventMapAvailable === true &&
    !research.researched
  ) {
    return {
      level: "high",
      label: "High Priority",
      reason:
        "Ticketmaster event with a map and parking research not yet completed.",
    };
  }

  /*
   * Review when information is incomplete.
   */
  if (
    event.eventMapAvailable !== true ||
    event.status === "unknown" ||
    !research.researched
  ) {
    return {
      level: "review",
      label: "Review",
      reason:
        "Event qualifies but some research information is incomplete.",
    };
  }

  return {
    level: "normal",
    label: "Researched",
    reason:
      "Parking research has been completed.",
  };
}


function renderParkingSection(event) {
  const parking = event.parking;

  if (!parking?.found) {
    return `
      <div class="parking-section parking-none">
        <span>🅿️</span>
        <span>No Ticketmaster parking event found</span>
      </div>
    `;
  }

  return `
    <div class="parking-section">
      <div class="parking-header">
        <strong>🅿️ Parking Available</strong>
        <span>${parking.count} option${parking.count === 1 ? "" : "s"}</span>
      </div>

      <div class="parking-list">
        ${parking.events
          .map(
            (parkingEvent) => `
              <div class="parking-event">
                <div class="parking-event-name">
                  ${escapeHtml(parkingEvent.name)}
                </div>

                <div class="parking-event-meta">
                  ${escapeHtml(
                    parkingEvent.venue ||
                    event.venue ||
                    ""
                  )}
                </div>

                <a
                  href="${escapeHtml(
                    parkingEvent.eventUrl
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="parking-ticket-link"
                >
                  View Parking Ticket →
                </a>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}


function saveEventResearch(eventCard, eventId) {
  const research =
    loadResearch();

  const parkingTypes = {};

  eventCard
    .querySelectorAll(
      "[data-parking-type]"
    )
    .forEach((checkbox) => {
      parkingTypes[
        checkbox.dataset.parkingType
      ] = checkbox.checked;
    });

  const selectedStatus =
    eventCard.querySelector(
      "[data-parking-status]:checked"
    );

  const parkingFound =
    selectedStatus?.value ||
    "unknown";

  const parkingPrice =
    eventCard.querySelector(
      "[data-parking-price]"
    )?.value.trim() || "";

  const parkingListingUrl =
    eventCard.querySelector(
      "[data-parking-url]"
    )?.value.trim() || "";

  const parkingNotes =
    eventCard.querySelector(
      "[data-parking-notes]"
    )?.value.trim() || "";

  research[eventId] = {
    parkingFound,

    parkingTypes,

    parkingPrice,

    parkingListingUrl,

    parkingNotes,

    researched: true,

    lastChecked:
      new Date().toISOString(),
  };

  saveAllResearch(research);

  return research[eventId];
}


function attachResearchHandlers() {
  document
    .querySelectorAll(
      "[data-save-research]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {
          const eventId =
            button.dataset.saveResearch;

          const eventCard =
            button.closest(".event-card");

          if (!eventCard || !eventId) {
            return;
          }

          saveEventResearch(
            eventCard,
            eventId
          );

          button.textContent =
            "Research Saved";

          button.classList.add("saved");

          setTimeout(() => {
            button.textContent =
              "Save Research";
          }, 1500);

          /*
           * Re-rendering isn't necessary here.
           * The saved values remain in the form.
           */
        }
      );
    });
}