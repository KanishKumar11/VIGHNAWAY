# ARCHITECTURE.md

Owner: Platform. Read with AGENTS.md. Decision records are at the end.

## Diagram

```text
                    packages/scenario-data (graph.json, scenario.json, places)
                         │ bundled into both clients, seeded into PostGIS
          ┌──────────────┼───────────────────────────────┐
          ▼              ▼                               ▼
 ┌─────────────────┐  ┌──────────────────┐     ┌──────────────────────────┐
 │ apps/mobile     │  │ apps/console     │     │ apps/api (NestJS)        │
 │ Expo dev build  │  │ Next.js          │     │ incidents, reports, sim, │
 │ Google Maps     │  │ Google Maps JS   │     │ operator actions, gateway│
 │ engine.planTrip │  │ engine.planTrip  │     │ NEVER computes routes    │
 │ engine.replan   │  │ (same inputs)    │     │ Drizzle → Postgres+PostGIS│
 └───────┬─────────┘  └────────┬─────────┘     └──────────┬───────────────┘
         │ REST: reports, incidents?sinceSeq               │
         │ socket.io /live: incident.upserted, sim.*,      │
         │                  trip.position (display only)   │
         └────────────────────────┴────────────────────────┘
```

**Sync principle.** Incidents are the only shared state that drives routing. The API persists,
validates, snaps, corroborates and sequences them (per-scenario `seq`) and broadcasts every change.
Each client keeps `incidents by id` plus `lastSeq`, resyncs with `GET /scenarios/:id/incidents
?sinceSeq=` on every connect, and recomputes routes locally with `packages/engine`. Because both
clients run the same pure engine on the same graph version, incident snapshot, simulation time and
trip inputs, they reach the same recommendation independently (checked by the parity hash). The
demo vehicle's position is relayed (`trip.position`) for display only.

## Packages and boundaries

| Package | May import | Must not |
| --- | --- | --- |
| `packages/contracts` | zod | React, React Native, Node built-ins, side effects |
| `packages/engine` | contracts | React, RN, Node built-ins, clocks (`Date.now`), randomness, I/O |
| `packages/tokens` | nothing | platform code |
| `packages/scenario-data` | contracts (engine only in dev scripts) | runtime logic |
| `apps/api` | contracts, scenario-data; engine **only in tests** | returning routes |
| `apps/console` | contracts, engine, tokens, scenario-data | routing outside the engine |
| `apps/mobile` | contracts, engine, tokens, scenario-data | Expo Go, hard-coded colours |

Each package exports `src/index.ts` under the `@vighnaway/source` condition (used by Vitest, tsc,
tsx and the bundlers) and built ESM/CJS in `dist/` for Node (the NestJS API). Turborepo builds
packages before dependents (`^build`).

## Folder structure

```text
apps/mobile    app/ (expo-router: _layout, first-run, report, (drawer)/...), src/{components,
               features, stores, lib, i18n, theme}, test/, maestro/
apps/console   src/app/{console,report,rules,debug}, src/{components,lib,stores,i18n}
apps/api       src/{scenarios,incidents,reports,sim,live,db,health,common}, test/, drizzle/
packages/*     src/, test/, scripts/
infra/         docker-compose.yml, seed/
scripts/       extract_graph.py, preflight.mjs
```

## Runtime configuration

All domains, URLs and keys are environment variables (see README and `.env.example` files). The
whole stack runs locally without any domain: `docker compose -f infra/docker-compose.yml up -d`
(PostGIS + API) or a local Postgres with PostGIS, `pnpm --filter console dev`, and the phone on the
same LAN pointing `EXPO_PUBLIC_API_URL` (or Settings → Server address) at the laptop.

## Time

The server owns the simulation clock (`simTimeS`, seconds since the scenario's `clockStartsAt`).
Every stored timestamp is simulation time assigned by the server. Clients render the clock from
`sim.tick` and pass `simTimeS` into the engine as `nowS`; the engine never reads a clock.

## Decision records

| # | Decision | Reason |
| --- | --- | --- |
| 1 | Expo custom dev build, never Expo Go | react-native-maps with Google keys, MMKV, keyboard-controller and notifications need native code |
| 2 | Google basemap (react-native-maps / @vis.gl/react-google-maps) | Familiar, high-quality basemap with custom styling; our routes are drawn on top |
| 3 | Own deterministic engine | Routing decisions must be explainable, reproducible and identical on phone and console; no hosted router can explain evidence-weighted hazards |
| 4 | PostGIS | Snapping within 30 m, corroboration within 150 m and nearest queries are one SQL each with GiST indexes |
| 5 | Drizzle | Typed schema and SQL-first migrations; custom geometry types are simple |
| 6 | socket.io | Rooms per scenario, reconnection, works through the phone hotspot; seq resync covers missed events |
| 7 | Candidate generation = Yen (k = 5, budgeted) + edge-penalty alternatives + hazard-aware best path | Yen alone returns near-identical variants on dense street grids; penalty rounds find other crossings |
| 8 | Goal-directed search with arithmetic-only heuristic | Performance on OSM-sized graphs while keeping Hermes/V8 bit-for-bit parity |
| 9 | Incident extent = snapped edge + reverse twin + same-named edges within 60 m (600 m for congestion) | A report describes a stretch, not a single edge; queues extend along a road |
| 10 | Conflicting is a flag, not a status | A Road clear report must not weaken a hard block; only an operator or two clear devices resolve |
| 11 | Schematic fixture graph committed alongside the OSM extract script | The sandbox that built this could not reach OpenStreetMap; the fixture keeps every surface runnable and is labelled everywhere |
