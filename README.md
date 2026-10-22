# VIGHNAWAY

Emergency-aware navigation prototype (hackathon). Ordinary navigation picks the fastest route;
in a flood that route may be blocked. VIGHNAWAY evaluates candidate routes against reported
hazards and the evidence behind them, recommends a viable alternative, explains why in one
sentence, and reassesses when the evidence changes, while holding steady when it does not.

**Real roads, simulated conditions.** Every flood, closure and congestion in the demo is
simulated and labelled as such everywhere.

| Surface | Folder | Stack |
| --- | --- | --- |
| Citizen app | `apps/mobile` | Expo SDK 58 custom dev build (never Expo Go), Google Maps via react-native-maps |
| Control room, /report, /rules, /debug | `apps/console` | Next.js 15, Tailwind 4, @vis.gl/react-google-maps |
| API | `apps/api` | NestJS 11, Drizzle, Postgres 16 + PostGIS 3.4, socket.io |
| Route engine | `packages/engine` | Pure TypeScript, deterministic, runs in Hermes, browsers and Node |
| Contracts | `packages/contracts` | Zod schemas, socket events, REST payloads |
| Design tokens | `packages/tokens` | Colours, type, spacing, route/marker styles, map style |
| Scenario data | `packages/scenario-data` | Andheri graph, places, simulated scenario |

The server never sends routes: the phone and the console run the same engine on the same incident
snapshot and reach the same recommendation independently. Start with [`AGENTS.md`](AGENTS.md) and
[`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md); design in [`docs/`](docs).

## Setup

Requirements: Node 22, pnpm 10, Postgres 16 with PostGIS 3.4 (or Docker), Python 3.11+ only for
the OSM extract, Android Studio / SDK for the mobile dev build.

```sh
pnpm install
pnpm build                                  # packages first (Turborepo), then apps
cp .env.example ...                         # see "Environment" below
docker compose -f infra/docker-compose.yml up -d db   # or a local Postgres with PostGIS
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm preflight                              # env, DB/PostGIS, API health, CORS, SHA-1, token leaks
```

## Run

```sh
pnpm --filter api dev                       # http://localhost:4000 (needs OPERATOR_TOKEN, CORS_ORIGINS)
pnpm --filter console dev                   # http://localhost:3000/console
pnpm --filter mobile android                # builds and installs the dev client (expo run:android)
pnpm --filter mobile start                  # Metro for the dev client
```

Full stack in Docker: `OPERATOR_TOKEN=... docker compose -f infra/docker-compose.yml up -d`.
Demo procedure: [`docs/demo-script.md`](docs/demo-script.md).

## Test

```sh
pnpm test        # all suites (API tests need Postgres+PostGIS; TEST_DATABASE_URL, name ending _test)
pnpm typecheck
pnpm lint
pnpm --filter @vighnaway/engine bench       # planTrip timings
pnpm --filter @vighnaway/scenario-data tune # replays the scripted demo offline and prints decisions
pnpm docs:scoring                           # regenerates docs/scoring.md from SCORING_RULES
pnpm graph:fixture                          # regenerates the schematic fixture graph and scenario
```

Mobile Maestro flow: `apps/mobile/maestro/primary-journey.yaml` (run on a device with Maestro).

## Environment

All domains, URLs and keys are environment variables; everything runs locally without owning
vighnaway.app. Full list with comments: [`.env.example`](.env.example) and each app's
`.env.example`.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | Postgres connection |
| `OPERATOR_TOKEN` | API (typed into the console at runtime) | Operator and simulation actions. Server-side only |
| `CORS_ORIGINS` | API | Allowed console origins (HTTP and socket) |
| `DEVICE_HASH_SALT` | API | Salt for hashing device ids and IPs |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_REPORT_URL` | Console | API URL, referrer-restricted browser key, QR target |
| `EXPO_PUBLIC_API_URL` | Mobile | Default API URL (editable in Settings) |
| `EXPO_PUBLIC_CONSOLE_URL` | Mobile | Public console address; shared routes then carry a decision-receipt link to its /verify page (optional) |
| `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY` | Mobile build | Native map keys (package + SHA-1 restricted) |
| `USE_CLEARTEXT` | Mobile build | `1` when the demo API is plain HTTP on the LAN |
| `API_BASE_URL`, `PUBLIC_SITE_URL`, `REPORT_URL` | preflight, deploy | Origins for checks, CORS and the QR code |

## What is real, simulated and incomplete

**Real:** the engine and its rules ([`docs/scoring.md`](docs/scoring.md)); the API's PostGIS
snapping, corroboration, sequencing and live sync; the console and the mobile app code.

**Simulated:** every incident, the rain alert, the scripted operator verifications, the demo
vehicle, and the road graph's positions (see below). Device corroboration is a prototype
heuristic, not proof of independent witnesses.

**Verified in the build environment** (no phone, no Google key, no access to OpenStreetMap):

- 172 automated tests pass: engine 44, contracts 9, tokens 2, scenario-data 5, API 34 (against
  PostGIS), console 48, mobile 30 (Jest with mocks). Build, typecheck and lint pass.
- The scripted scenario gives the same decisions in the offline replay, in the API's end-to-end
  test (identical plan hashes after reset), and in the console driven by Playwright against the
  real API: subway → unchanged after one unverified report → Gokhale Bridge → Jogeshwari Road Over
  Bridge → no viable route with HBT Trauma Care Hospital offered. Operator Verify reached the
  console in 26 ms.
- The mobile app bundles for Android with Metro (2,441 modules) and `expo prebuild` applies all
  config plugins.

**Not done or not verified** (details in [`docs/TASKS.md`](docs/TASKS.md) and
[`docs/limitations.md`](docs/limitations.md)):

- **Road graph:** `packages/scenario-data/andheri/graph.json` is a schematic fixture (real road
  names, approximate positions) because OpenStreetMap was unreachable. Run
  `scripts/extract_graph.py` with network access, review the overlay at the three crossings, then
  re-tune the scenario.
- **Phone:** nothing has run on a phone or emulator: no dev build, no APK, no section 8.7
  checklist, no Maestro run, no Hermes timing (budget 200 ms; Node: ~1 ms fixture, ~50 ms on a
  3,900-node grid), no phone/console parity hash comparison (console and Node agree:
  `a95cdcf0c94c84fd`). Hero screens are built but not reviewed or locked.
- **Google Maps:** untested on both surfaces (no key); the labelled schematic fallback was tested.
- **Docker image** for the API: compose config validates and the PostGIS container runs; the API
  image build was not completed in the sandbox (proxy certificate).
- **Event times were retuned** (14:06, 14:08, 14:09:30, 14:11, 14:13) to fit the fixture geometry;
  see the demo script.
- The hackathon's official judging criteria were not provided; `docs/PRD.md` maps assumed ones.

Attribution: road data from the OSM extract is © OpenStreetMap contributors; map tiles © Google.
Confirm that overlaying OSM-derived routes on Google Maps fits both providers' terms before any
public release.
