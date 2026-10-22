# ROADMAP_STATUS.md

Last updated 2026-10-22 (evening). Details are in docs/TASKS.md; the plan is in docs/IMPLEMENTATION_PLAN.md.

> **▶ Continue from here:** deploy and test the API changes below (migration 0003), then P1-3.d (the two-browser end-to-end), P0-4.d (re-tune on the real graph) and P0-6a.
> Data and sim: **P0-4.d re-tune the demo scenario on the real graph** is now the demo's biggest risk (see "Real graph
> landed" below). Whoever runs the demo on a phone needs P0-3 next.

## Now

| | |
| --- | --- |
| **Just finished** | P0-2 structured, localisable engine text (a–d); P1-1 counterfactuals (a–c, screenshots pending); P1-2 decision receipts (a–c, Playwright check pending) |
| **In progress** | Verifying the API changes (written and typechecked, not run: no Postgres on the dev machine) |
| **Next** | P1-4 ask the crowd, P1-5 evidence coverage map, then P0-6a Docker image, P0-5a–c runbook, drill and recording |
| **Gate in view** | G-P0 sandbox |

## Real graph landed (P0-4 data merged by the Data and sim workstream)

`packages/scenario-data/andheri/graph.json` is now a real OSM extract (10 MB, `osm-8bb15d429936`) with new places and
scenario files. It replaced the schematic fixture, so everything that asserted fixture roads fails until the scenario is
re-tuned. This is expected and is the P0-4.d task, not a regression:

| Where | State on the real graph |
| --- | --- |
| `packages/engine` tests | Decoupled: they now run on a frozen copy of the fixture in `packages/engine/test/fixtures`. 72/72 pass |
| `packages/scenario-data` | 2 fail: "A beats B and B beats C by 4 to 6 minutes", and "produces the three proofs in order" (the re-tune) |
| `apps/console` | 9 fail: demo trip follower, map geometry, decision replay and one Hindi sentence test, all asserting Andheri Subway / Gokhale names |
| `apps/mobile` | Hero-fixture tests fail (planner, status, map, sheet, navigate, v4 speech); the new engineText test passes |
| Offline replay (`tune`) | The script still runs and changes routes, but its incidents snap to unnamed roads ("null (2 edges)") and two shown routes share the name "Via Mathuradas Vasanji Road (Andheri Kurla Road)" |

Data and sim: pick the three crossings, give the scenario events road names that exist in the real graph, re-run
`pnpm --filter @vighnaway/scenario-data tune`, then update the hero fixtures and the console and phone tests (Console and
Mobile own their tests) and record the new hashes below.

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
The hash table must be recomputed on the real graph after P0-4.d (the engine, phone and console `/debug` must still agree).

## Completed

| Item | Evidence |
| --- | --- |
| P0-0.a Documentation sync | IMPLEMENTATION_PLAN §1. The `f8f85a4` tree (committed as "WIP, unverified") was verified afterwards: tsc, eslint, jest 77/77 and the Android export |
| P0-1.a Mobile design pass in the browser preview | docs/design/preview, 38 screenshots |
| P0-2.a–d Structured, localisable engine text | Engine 72/72 (new text tests: catalogs, every parity plan in en/hi/mr), console 91/91, phone 77/77 plus 7 new engineText tests (on the fixture); parity and all 9 replay hashes identical to the baseline. Hindi/Marathi still need native review |
| P1-1.a–c Counterfactuals | Engine tests: blocked, hazard-penalised, slower-only, two hazards, a property test that clearing the stated hazards in a fresh planTrip makes the route recommended; scoring.md section; UI on console and phone (screenshots still to capture) |
| P1-3.a–c judge-in-the-loop, API written NOT run | apps/api: migration `0003_audience_origin.sql` (adds `incident_reports.origin` and `incidents.audience_only`), report origin audience/web/app/prompt, `POST /scenarios/:id/audience/clear`, prompt answer limit (409) and no-resolve rule, observations in `GET /incidents`; tsc and eslint clean; test/audience.test.ts written. Console: presenter card with QR (/report?audience=1), live status ladder, confirmed clear, "Demo audience" chip, report-page audience note (vitest 8); phone sends origin prompt. **To check after redeploying: `pnpm --filter api db:migrate`, `pnpm --filter api test`, then scan the QR from two phones** |
| P1-3.c (QR card only, earlier) Presenter QR | Presenter mode shows a large QR to /report with the four evidence steps (vitest 3). Audience tag, status ladder and bulk clear need the API owner |
| P1-4.a, P1-4.c Ask the crowd (phone) | Engine ask.test.ts (4); phone ask.test.tsx (8). The API side (P1-4.b: answers must not resolve incidents, 409 on a repeat) and the web question page (P1-4.d) are not built |
| P1-5.a, P1-5.b (panel only) Evidence coverage | Engine coverage.test.ts (8): class boundaries at 30 min and 3 h, mixed edges, sort order, the 60-min brief window; console coverage.test.tsx (4). Map shading and the toggle still to build; Road-clear-only observations need F-COV.a |
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

Latest per-package runs, evening of 2026-10-22: engine **72/72** (frozen fixture), contracts 11/11, console 91/91 and phone
77/77 on the fixture data, phone engineText 7/7 on the real graph. On the real graph the demo-tuning tests fail as listed
in "Real graph landed". `tsc` and `eslint` are clean for engine, contracts, console and phone.

| Package | Tests |
| --- | --- |
| tokens | 104 |
| contracts | 11 |
| scenario-data | 5 |
| engine | 48 |
| API | 45 |
| console | 91 |
| mobile | 77 |

`pnpm typecheck` and `pnpm lint` are clean.

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
| P0-4d re-tune the scenario on it | todo, **demo risk** |
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
- place search covers only the roads and places inside the bundled Andheri map (no street numbers, no landmarks other than the scenario places; no hosted geocoder);
- no device run;
- translations not reviewed by native speakers;
- device-id corroboration is a heuristic;
- shared operator token.
