# Ticketmaster Parking Event Finder — Feed Index Architecture

## Runtime architecture

Ticketmaster Discovery Feed
        |
        | ~103k US events
        v
GitHub Actions
Feed Processor
        |
        +-----------------------+
        |                       |
        v                       v
Complete Index            Parking Index
data/events.json          data/parking.json
        |                       |
        +-----------+-----------+
                    |
                    v
          Prebuilt Search Shards
          data/search/**
                    |
                    v
            Cloudflare Worker
                    |
             +------+------+
             |             |
             v             v
         /events       /parking

## Important design decision

`events.json` and `parking.json` are complete generated archives.

The Cloudflare Worker does NOT parse the 100k+ event archive on every request.

Instead, GitHub Actions creates small search shards under:

`data/search/`

This matters because the current Cloudflare Workers Free plan has only 10 ms CPU time per HTTP request and 128 MB memory. Parsing a 100k-event JSON file on every request is therefore not a good free-tier runtime design.

## Automatic parking cross-check

The feed processor performs the cross-check during the GitHub Action run.

For every parking event it attempts to find its related non-parking event using:

1. same local date
2. same venue ID where available
3. same venue name/city
4. shared attraction IDs
5. meaningful name/attraction token overlap

The generated records then contain:

### Complete event

```json
{
  "id": "...",
  "name": "...",
  "localDate": "2027-01-28",
  "venue": {
    "id": "...",
    "name": "Intuit Dome"
  },
  "parkingMatches": [
    {
      "id": "...",
      "name": "Intuit Dome Parking - Olivia Rodrigo",
      "eventUrl": "...",
      "localDate": "2027-01-28"
    }
  ]
}
```

### Parking event

```json
{
  "id": "...",
  "name": "Intuit Dome Parking - Olivia Rodrigo",
  "localDate": "2027-01-28",
  "matchedEventIds": [
    "..."
  ]
}
```

This means `/events` and `/parking` are independent search endpoints, while the records themselves already know about the other side.

## Generated search indexes

For events:

- `data/search/events/name/*.json`
- `data/search/events/attraction/*.json`
- `data/search/events/city/*.json`
- `data/search/events/state/*.json`
- `data/search/events/month/*.json`

For parking:

- `data/search/parking/name/*.json`
- `data/search/parking/attraction/*.json`
- `data/search/parking/city/*.json`
- `data/search/parking/state/*.json`
- `data/search/parking/month/*.json`

The Worker chooses the relevant shard before filtering.

Examples:

- `/events?keyword=Olivia%20Rodrigo`
  - searches attraction/name shards beginning with `ol`
  - then applies the full keyword filter
- `/events?keyword=Metallica`
  - searches `me` shards
- `/parking?keyword=Olivia%20Rodrigo`
  - searches parking `ol` shards
- `/parking?keyword=Intuit%20Dome`
  - searches parking `in` shards
- `/events?city=Inglewood`
  - searches the Inglewood city shard
- `/events?startDate=2027-01-01&endDate=2027-01-31`
  - searches the January 2027 month shard

## Secrets

GitHub repository secret:

`TICKETMASTER_API_KEY`

Do not put the Ticketmaster API key in:

- frontend code
- Worker variables
- `wrangler.jsonc`
- generated JSON
- committed source files

The Worker no longer needs the Ticketmaster key for normal search requests.

## GitHub Actions

The workflow runs daily at 03:00 UTC and can also be started manually.

GitHub Actions gets the current feed metadata first, then downloads the current `.json.gz` feed and streams it through Node.js.

## First deployment

1. Add this architecture to the existing repository.
2. Add the `TICKETMASTER_API_KEY` repository secret.
3. Run the workflow manually.
4. Confirm `data/events.json` exists.
5. Confirm `data/parking.json` exists.
6. Confirm `data/search/` contains shards.
7. Deploy the Worker.
8. Test `/stats`.
9. Test `/events?keyword=Olivia%20Rodrigo`.
10. Test `/parking?keyword=Olivia%20Rodrigo`.
11. Test `/events?keyword=Metallica`.
12. Test `/parking?keyword=Metallica`.

## Verification

The feed processor prints:

- total events processed
- parking events found
- complete archive size
- parking archive size
- events with parking matches
- Olivia-related event count and parking-match count
- Metallica-related event count and parking-match count

Those validation messages are intentionally included so the workflow does not silently claim that parking matching works.
