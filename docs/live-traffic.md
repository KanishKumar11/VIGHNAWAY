# Live traffic: TomTom adapter

**Status:** built and tested against a recorded-shape TomTom response (API tests and a running
server with a local mock). Not yet run against the real TomTom service: it needs your
`TOMTOM_API_KEY`, and api.tomtom.com was unreachable from the build environment.

## Principle

TomTom is **evidence, never a router.** The engine still decides; TomTom incidents become
VIGHNAWAY incidents (source `live_feed`, provider named on every label) and are weighed by the same
rules as reports and operator actions. This keeps the decision path deterministic and explainable.

The feed only writes to the **live scenario** (`andheri-live`, mode `live`): wall-clock time, no
scripted events, never labelled Simulated. The scripted demo (`andheri-monsoon`) is never touched,
so real traffic can never be mistaken for the simulated flood story, or the reverse.

## How it works

1. Every `TRAFFIC_POLL_SECONDS` (default 120) the API calls TomTom Traffic **Incident Details v5**
   once for the graph's bounding box (+200 m): `GET /traffic/services/5/incidentDetails?key&bbox&fields&language=en-GB&timeValidityFilter=present`.
   At 120 s that is 720 requests a day, inside TomTom's free tier.
2. Each incident is mapped (`apps/api/src/traffic/tomtom.ts`):

   | TomTom iconCategory | VIGHNAWAY incident | Level |
   | --- | --- | --- |
   | 6 Jam | congestion | magnitude 1 moderate, 2 heavy, 3–4 standstill |
   | 7 Lane closed, 9 Road works | congestion | moderate (heavy at magnitude ≥ 2) |
   | 8 Road closed | closure | impassable |
   | 11 Flooding | flood | depth not given → treated as knee depth |
   | 1 Accident | accident | severity by magnitude; impassable at magnitude 4 |
   | 14 Broken-down vehicle | debris | low |
   | 0, 2–5, 10 (unknown, weather) | skipped | area conditions, not a road state our rules weigh |

   `probabilityOfOccurrence`: **certain** counts like corroboration (an independent, named,
   automated source; label "Reported by TomTom live traffic"); **probable** or missing stays
   Unverified; **risk_of** and **improbable** are skipped. Only an operator ever sets Verified.
3. Matching to the graph (PostGIS candidates within `TRAFFIC_MATCH_DISTANCE_M`, default 25 m): an
   edge must follow the TomTom geometry along its length (samples at 25/50/75%) and, for directional
   hazards (jams, accidents), run within 50° of its direction, so only the affected carriageway is
   hit. Closures and flooding take both directions. Points match the nearest edge.
4. Lifecycle, all through the normal transaction (seq bump, audit event, `incident.upserted`):
   new → created; changed (level, probability, edges) → updated; unchanged → nothing published,
   except a refresh every 15 min so the engine's age factor stays current; gone from the feed →
   resolved ("no longer in the live traffic feed"), unless an operator verified it; reappears after
   clearing → a new incident linked to the old one; dismissed by an operator → not recreated while
   TomTom keeps reporting it. A failed poll changes nothing and is shown in the feed status.
5. Feed incidents also count as recent coverage for the data-gap rule.

## Endpoints and config

- `GET /scenarios/:id/feed` → `FeedStatus` (enabled, reason, last poll/success, last error, active
  incidents, attribution "Traffic data © TomTom").
- `POST /scenarios/:id/feed/poll` (operator) → poll now.
- Env (API only, never public): `TOMTOM_API_KEY`, `TOMTOM_BASE_URL` (default https://api.tomtom.com),
  `TRAFFIC_FEED_SCENARIO` (default andheri-live), `TRAFFIC_POLL_SECONDS` (default 120; 0 = manual
  only), `TRAFFIC_MATCH_DISTANCE_M` (default 25).

## Display-only Google traffic layer

The console and app can show Google's own traffic layer on the Google map as a visual aid,
labelled "Google traffic (display only)". It never feeds the engine: Google's terms restrict using
its data in a third-party routing engine, which is why TomTom is the engine's feed.

## Limits

- **Needs the OSM graph.** TomTom geometry is real-world; the committed schematic fixture is only
  approximately placed, so on it most real incidents will be counted as `unmatched`. Run
  `scripts/extract_graph.py` before relying on live mode.
- TomTom coverage and freshness in Andheri are whatever TomTom provides; delays shown are TomTom's
  estimate, while ETAs use VIGHNAWAY's own rules.
- A user report near a feed incident creates its own incident rather than joining the feed one.
- Check TomTom's terms for your plan (display of TomTom data alongside a Google basemap, caching).
