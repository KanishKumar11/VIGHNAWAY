# ROADMAP_STATUS.md

Last updated 2026-10-22 (evening). Details are in docs/TASKS.md; the plan is in docs/IMPLEMENTATION_PLAN.md.

> **▶ Continue from here:** deploy and test the API changes below (migration 0003 and the re-tuned scenario: `pnpm --filter api db:migrate`, `db:seed`, `pnpm --filter api test`), then P1-3.d (the two-browser end-to-end) and P0-5
> (runbook, drill, recording). P0-4.d (the scenario on the real graph) is done and replays identically in the engine and the
> console (see "Real graph landed"). Whoever runs the demo on a phone needs P0-3 next.

## Now

| | |
| --- | --- |
| **Just finished** | P0-4.d scenario on the real graph; P1-4.d web question page; P1-5.b map coverage layer; P1-6 scoreboard; P2-1 after-action report (all with vitest; screenshots in docs/design/p1 where captured) |
| **In progress** | Verifying the API changes (written and typechecked, not run: no Postgres on the dev machine) |
| **Next** | Redeploy and run the API checks; P1-3.d two-browser end-to-end; P0-5b–c drill and recording (needs the API); P0-3 device run; P1-6.c slide |
| **Gate in view** | G-P0 sandbox |

## Real graph landed (P0-4 data merged by the Data and sim workstream); scenario re-tuned (P0-4.d)

**Re-tuned (this change).** New demo trip: Ramesh Nagar (Andheri West) → Holy Spirit Hospital, three distinct corridors
(Andheri Subway 11 min, Balasaheb Thackeray Flyover, Ceasar Road), then the G K Gokhale Flyover when the subway floods. The
replay still shows the three proofs in order: one unverified report holds the route; a corroborated knee-deep flood switches
to G K Gokhale Flyover; corroborated heavy congestion there switches to Balasaheb Thackeray Flyover; a verified closure of the
single road into Holy Spirit Hospital switches to HBT. What had to change to make that true on real data:
- the real OSM data has no flood-prone underpass the demo could use, so `flood-prone.json` marks OSM ways 1111987532 and
  1111987533 (the road under the Andheri railway line) as flood-prone, named "Andheri Subway", tunnel (an assumption, not a
  measurement; `python scripts/apply_flood_prone.py` applies it and re-versions the graph: `osm-7efdf89a8094`);
- **scoring rule change** (docs/scoring.md, BUILD_PROMPT): the data-gap penalty counts one gap per continuous stretch of
  flood-prone edges, covered when any edge of the stretch has a recent report (real roads are split into many short edges);
  engine test `gap-stretch.test.ts`; parity hash on the frozen fixture unchanged;
- **display rule**: a route whose title equals one already shown is dropped from the list (the real graph produced
  several "Via Mathuradas Vasanji Road"); parity hash on the frozen fixture unchanged;
- the vehicle runs at 0.5 speed, a new origin place `origin-ramesh-nagar`, new event points (see scenario.json).


`packages/scenario-data/andheri/graph.json` is now a real OSM extract (10 MB, `osm-8bb15d429936`) with new places and
scenario files. It replaced the schematic fixture, so everything that asserted fixture roads fails until the scenario is
re-tuned. This is expected and is the P0-4.d task, not a regression:

| Where | State on the real graph |
| --- | --- |
| `packages/engine` tests | Decoupled: they now run on a frozen copy of the fixture in `packages/engine/test/fixtures`. 72/72 pass |
| `packages/scenario-data` | 6/6 after the re-tune |
| `apps/console` | demo trip, map geometry, decision replay and the Hindi sentence tests updated to the new roads; 30 s test timeout for the 10 MB graph |
| `apps/mobile` | fixture-based suites pass on the real graph (110/110 when the machine is not overloaded); jest timeout 30 s |
| `apps/api` | tests updated to the real graph (points, edge ids, the TomTom fixture): **written, not run** (no Postgres here) |

**Hashes on the real graph** (`osm-7efdf89a8094`, `pnpm --filter @vighnaway/scenario-data hashes`): parity
`670fb828acd334e9` (162 cases); replay plan at 0 s `9f9f276cfff73b2d`, 60 s `4c3d4694e7d0dddb`, 180 s
`3c27f789b4c5d320`, 270 s `f5fb1326227508f9`, 360 s `870203bd9333c92e`, 370 s `7d66966e610ba761`, 480 s
`778228f71464e93e`, 490 s and end `b1786ee712b38072`. The engine, phone and console `/debug` must still agree.

## Hash baselines

Hashes now include `RouteEvaluation.counterfactual` (kind and ids; not its text). They are recorded on the **frozen
fixture** that the engine tests use.

| Hash | Before P1-1 (P0-2 verified unchanged against this) | With counterfactuals (current) |
| --- | --- | --- |
| Parity (162 cases) | `1b6ed86885d3f0bd` | `66ccea235ae1b092` |
| Replay plan, step 0 | `23f43274ce2ae103` | `2cd1193c47541d17` |
| Replay plan, step 60 s | `1afd41030b43f502` | `b7cdae5b7cd1d07e` |
| Replay plan, step 180 s | `080b7c3daff07586` | `a26600f58cb93286` |
| Replay plan, step 270 s | `bff5b0dc907c1c3f` | `9e7a57b437db8bf3` |
| Replay plan, step 360 s | `697d7eed6f702f64` | `ebbc0e6900b65196` |
| Replay plan, step 370 s | `cfa44f990a4181aa` | `2e832a1e4566ee7f` |
| Replay plan, steps 480 s, 490 s and end | `f5a43c279a25980c`, `1460c1b2e6d2460f`, `1460c1b2e6d2460f` | unchanged (no alternatives to explain) |

P0-2 was verified by computing the old columns with `counterfactual` excluded from the hash: every one equals the
pre-refactor baseline, so the structured-text refactor changed no routing output and no English string.
The real-graph hashes are listed above under "Real graph landed".

## Completed

| Item | Evidence |
| --- | --- |
| P0-0.a Documentation sync | IMPLEMENTATION_PLAN §1. The `f8f85a4` tree (committed as "WIP, unverified") was verified afterwards: tsc, eslint, jest 77/77 and the Android export |
| P0-1.a Mobile design pass in the browser preview | docs/design/preview, 38 screenshots |
| P0-2.a–d Structured, localisable engine text | Engine 72/72 (new text tests: catalogs, every parity plan in en/hi/mr), console 91/91, phone 77/77 plus 7 new engineText tests (on the fixture); parity and all 9 replay hashes identical to the baseline. Hindi/Marathi still need native review |
| P1-1.a–c Counterfactuals | Engine tests: blocked, hazard-penalised, slower-only, two hazards, a property test that clearing the stated hazards in a fresh planTrip makes the route recommended; scoring.md section; UI on console and phone (screenshots still to capture) |
| P1-3.a–c judge-in-the-loop, API written NOT run | apps/api: migration `0003_audience_origin.sql` (adds `incident_reports.origin` and `incidents.audience_only`), report origin audience/web/app/prompt, `POST /scenarios/:id/audience/clear`, prompt answer limit (409) and no-resolve rule, observations in `GET /incidents`; tsc and eslint clean; test/audience.test.ts written. Console: presenter card with QR (/report?audience=1), live status ladder, confirmed clear, "Demo audience" chip, report-page audience note (vitest 8); phone sends origin prompt. **To check after redeploying: `pnpm --filter api db:migrate`, `pnpm --filter api test`, then scan the QR from two phones** |
| P1-3.c (QR card only, earlier) Presenter QR | Presenter mode shows a large QR to /report with the four evidence steps (vitest 3). Audience tag, status ladder and bulk clear need the API owner |
| P1-4.a, P1-4.c Ask the crowd (phone) | Engine ask.test.ts (4); phone ask.test.tsx (8). The API side (P1-4.b: answers must not resolve incidents, 409 on a repeat) is written, not run (see P1-3). The web question page (P1-4.d, `/report?ask=lat,lng&road=name`) is built: console vitest 9 |
| P1-5.a, P1-5.b (panel only) Evidence coverage | Engine coverage.test.ts (8): class boundaries at 30 min and 3 h, mixed edges, sort order, the 60-min brief window; console coverage.test.tsx (4). Map shading and the View-menu toggle are built (coverageLayer.test.tsx 4); screenshots pending. Road-clear-only observations need the API change (written, not run) |
| P1-6.a–b Scenario scoreboard | `pnpm scoreboard`: 20 seeded scenarios on the real graph, docs/scoreboard.md and .json, headline: usual route meets a hard block in 8 of 20, median extra 0.3 min, worst 2.9 min, 5 scenarios where the recommendation is slower with no hard block avoided; scenario-data vitest 11/11. Slide (P1-6.c) not made |
| P0-5.b / P1-3.d API drill script | `pnpm smoke` (scripts/smoke-demo.mjs): 22 REST checks over the scripted run, replay determinism, audience flow, ask limits; **run 2026-10-22 night against the developer's running API (graph `osm-7efdf89a8094`, PostGIS 3.3.7): 18/18 pass**, which exercises migration 0003, report origin, audience tag and clear, the prompt 409 and no-resolve rules and `observations` for real. The API's own vitest suite still could not run here (no database on 127.0.0.1:5432). The browser half of the two-browser end-to-end is still to do |
| P1-6.c Pitch slides | docs/pitch-slides.md: scoreboard slide (figures checked by a test) and path to a pilot |
| P0-3 Android run | partial on a Motorola Edge 50 Fusion (Android 16) using the previously installed dev client with Metro: trip, schematic map and profile chips work; first plan on the real graph took about a minute in a development build; bottom sheet and pills sit under the 3-button navigation bar; parity hash, notifications and haptics not checked; a rebuilt dev client fails on Windows' 260-character path limit (details in docs/TASKS.md P0-3) |
| P2-3 Step-free walking profile | profile `step_free`, rule `stepFree`, `stepFreeUnknownCount`, phone chip; engine test/step-free.test.ts 7 pass; parity hash unchanged (parity covers the original three profiles); console chip not built |
| P2-2 Offline QR relay | `clientReportId` and `observedAtS` with idempotent relay (API, run against the developer's database, 6 of 6); shared `VW1:` payload (contracts, 6 tests); phone: ids on every report, "Show report as a code" screen and an Activity entry (jest relay 9 pass); console: webcam/paste relay dialog (vitest 8 pass, a phone-style QR decoded back to the same text); not built: the phone scanner (native expo-camera) |
| P2-6 Operator-drawn closures | API `POST /scenarios/:id/closures` run against the developer's database (preview, 401, 422, confirm, 409, history entry); console "Close a road" tool, vitest closeRoad 6; smoke script has 4 more checks; the API's own vitest file is written but could not run here |
| P2-4.b Hospital load spreading (engine only) | `assignHospitals` and the `hospitalLoad` rule; engine test/hospital.test.ts 7; API operator action and UI not built |
| P2-5.a CAP rain-alert parser (parser only) | apps/api/src/alerts/cap.ts against a hand-written fixture; `pnpm --filter api test:unit` 30 (incl. 6 CAP); not wired to the live scenario |
| P2-1.a After-action report | Console `/after-action`: provenance, summary tiles, comparison with the usual fastest route, a timeline with the engine's sentence at each change and a /verify link per moment; vitest 8. Screenshots and the print check still to do |
| P1-2.a–c Decision receipts | Engine receipt.test.ts (7): verify, determinism, round trip, malformed and tampered tokens. Console: /verify page, Create receipt card with QR, test/receipt.test.tsx (7, incl. a tampered receipt and Hindi). Phone: share text carries the hash and a verify link (3 jest tests). Playwright check of a step-3 receipt on a second machine still to do |

## Blockers

| Blocker | Items | What unblocks it |
| --- | --- | --- |
| No Android device or SDK in the build sandbox | P0-1c, P0-3, device halves of P1-4, P2-2 and P2-7 | A phone and a laptop with the Android SDK |
| No Google Maps key | P0-3a/b, real map in all screenshots | A browser key restricted by referrer; an Android key restricted by package and SHA-1 |
| Network policy rejects Overpass, TomTom and SACHET | P0-4a–d, P0-6b, P2-5c | Allow those hosts in the environment's network settings |
| People | P0-5d rehearsals, P3-2b native review | The team |
| Owner decision | P0-1d landscape Drive (native install); language scope (spec: Hindi + Punjabi; built: Hindi + Marathi) | Owner |

## Tests

Baseline run on 2026-10-22, `pnpm test`: **381 passing, 0 failing** (before the real graph merged).

Latest per-package runs, night of 2026-10-22, on the real graph: engine **87/87** (the 200 ms perf test can flake when the
machine is busy), contracts 16/16, scenario-data 11/11, console **143/143** (new: ask 9, afterAction 8, coverageLayer 4),
phone 110/110 (jest timeout raised to 30 s for the 10 MB graph). API: tests updated to the real graph, **not run**
(no Postgres here). `tsc` and `eslint` are clean for engine, scenario-data, console and phone; API `tsc` was clean when last run.

| Package | Tests |
| --- | --- |
| tokens | 104 |
| contracts | 16 |
| scenario-data | 11 |
| engine | 87 |
| API | not run (45 existed before the real graph) |
| console | 143 |
| mobile | 110 |

`pnpm typecheck` and `pnpm lint` were clean for the packages above; run them again after pulling teammates' changes (accounts are in flight).

## Remaining P0

| Item | State |
| --- | --- |
| P0-1b offline and loading recapture | todo |
| P0-1c device review | blocked |
| P0-1d landscape Drive | needs decision |
| P0-2a–d structured engine text | done (native-speaker review pending) |
| P0-3 Android run | blocked |
| P0-4p graph validation | todo |
| P0-4a–c real graph | graph merged by Data and sim; review pending |
| P0-4d re-tune the scenario on it | done (engine replay, console follower; API test expectations written, not run) |
| P0-5a–c runbook, drill, recording | todo |
| P0-5d rehearsals | blocked |
| P0-6a Docker image | todo |
| P0-6b live TomTom | blocked |

## Demo readiness

**Ready in the sandbox:**
- the scripted 7-step console demo against the real API, verified end to end;
- the public report page;
- the phone in the browser preview.

**Not ready:**
- the phone on a device;
- a real map and real road geometry;
- rehearsals;
- a recorded fallback.

## Known limitations

See docs/limitations.md. The main ones:
- schematic road fixture;
- place search covers the roads and places inside the bundled Andheri map and the cities, towns and villages along the Amritsar to Ambala corridor (no street numbers, no landmarks other than the scenario places; no hosted geocoder);
- the Amritsar to Ambala map is roads only (motorway, trunk, primary, secondary, plus tertiary and unclassified streets around each city and town, from OpenStreetMap): real distances, but no incidents, alerts, simulation or live feed, and ETAs use typical speeds per road class, not live traffic. A start or end more than 15 km from a mapped road is refused, and a trip cannot cross between the two maps;
- bridges, tunnels and flyovers are not extracted for the corridor, so its route strip shows none;
- no device run;
- translations not reviewed by native speakers;
- device-id corroboration is a heuristic;
- shared operator token.
