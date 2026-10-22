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

## Run against the real TomTom service (2026-10-22 night)

**Status: works.** The API that was running on the developer's machine (`TRAFFIC_FEED_SCENARIO` set, key in `apps/api/.env`, which this
document does not print) polled `api.tomtom.com` and wrote labelled incidents into the live scenario `andheri-live`, on the real
OpenStreetMap graph `osm-7efdf89a8094`. One manual poll (`POST /scenarios/andheri-live/feed/poll`) returned:

| Figure | Value |
| --- | --- |
| Fetched from TomTom | 14 |
| Invalid / skipped | 0 / 0 |
| Unmatched to the graph | 6 |
| Created / updated / cleared | 2 / 0 / 0 |
| Active live-feed incidents afterwards | 8 |
| Status line | `Traffic data © TomTom`, last success at the poll, no error |

The feed had already been polling every 120 s for a while: the live scenario held 775 incidents, 767 of them Resolved (conditions
that cleared) and 8 open. The 8 open ones were 5 closures ("Closed", "Bridge closed", magnitude 4) and 3 congestion incidents
(standstill, heavy, moderate, one of them roadworks), on named roads such as Mahakali Caves Road, Shree Yavateshwar Marg,
Sant Gadge Maharaj Marg and B D Sawant Marg.

**Differences from the recorded fixture (to keep in mind when reading the tests):**
- **Real closures arrive Unverified, not Corroborated.** The fixture's closure carried `probabilityOfOccurrence: certain`, which the
  mapping counts as corroboration. The real closures had no usable probability, so they stay Unverified (a ranking penalty and a
  visible warning, not a hard block), which is what the rules say for an unverified closure. Only an operator ever sets Verified.
- **Unmatched incidents are normal.** 6 of 14 could not be matched to graph edges within the matching distance (incidents on roads
  outside the extract or with geometry that does not line up). They are counted, not shown.
- **Several incidents share the same road name** (for example roadworks and a closure on one corridor); each stays its own incident.
- **Delay is absent for closures and roadworks** (`delayS` null); congestion carries it.
- **History accumulates quickly:** Resolved feed incidents stay in the database (775 after a long run). `/incidents` returns them
  all; clients should filter by status, as the console and phone already do.

**Not verified here:** how the TomTom incidents look on the phone's map (no Google Maps key), and the accuracy of TomTom's data. The
feed is evidence, never a router; the engine still decides.

## Rain-alert feed (P2-5.b)

Set `ALERT_FEED_URL` to a CAP 1.2 feed (SACHET publishes CAP) and the API reads it every `ALERT_POLL_SECONDS` (default 600; 0 means only when an operator calls `POST /scenarios/:id/alerts/poll`). The active Mumbai rain alerts become the live scenario's `alerts[]`, each with its sender as the source and `simulated: false`; `hasAlertInformation` becomes true after the first good read. `GET /scenarios/:id/alerts` says whether it is on, when it last worked, the last error and what a read kept or left out (not Actual, cancelled, expired, other area, not rain). If a read fails the alerts already stored stay and the status says how old they are. The feed must serve CAP `<alert>` documents: a page with none is reported as an error, not as "no alerts". It only runs for the live scenario; the simulated demo keeps its own labelled alert. Not tested against the real feed (it was unreachable when written): only against a local server serving docs-style CAP, and the stored write was not exercised on the real database.
