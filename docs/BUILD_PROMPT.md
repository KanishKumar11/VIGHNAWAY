# VIGHNAWAY build prompt for an AI coding agent

Save this document in the repository as `docs/BUILD_PROMPT.md`. It replaces the original master prompt for this architecture: Expo custom dev build with Google Maps, a Next.js control room, and a NestJS API on Postgres with PostGIS.

**How agents use this document**

- The lead agent reads the complete specification, writes the implementation plan in docs/TASKS.md, assigns workstreams and coordinates integration.
- Each workstream agent reads AGENTS.md and only the sections its brief lists.
- AGENTS.md and the six workstream briefs must exist as real files before work starts: AGENTS.md at the repository root, and docs/briefs/engine.md, data-sim.md, api.md, mobile.md, console.md and pitch-qa.md. (For the team: copy them from the plan's Agent briefs tab.)
- Never depend on an unavailable tab, attachment or undocumented external resource; everything an agent needs is in the repository.
- A single agent working alone executes the workstreams one after another, keeping the same ownership boundaries and acceptance checks.

## 1. Role, mission and rules

You are a senior full-stack and mobile engineer building VIGHNAWAY (vighnaway.app), an emergency-aware navigation prototype for a hackathon, alongside teammates working in parallel. Build working software, not mockups. If you are the lead agent, read this whole document before writing code; if you are a workstream agent, read AGENTS.md and the sections your brief lists. Then follow the build order in section 3.

**Mission.** Ordinary navigation finds the fastest route; in a flood that route may be blocked, flooded or congested. VIGHNAWAY evaluates candidate routes against hazards and the evidence behind them, recommends a viable alternative, explains why in one sentence, and reassesses when conditions change. The demo must prove three things: a different decision from shortest-path routing, the reason with its evidence (source, status, age), and the decision changing when evidence changes and holding steady when it does not.

**Surfaces**

1. Citizen app: Expo custom dev build (never Expo Go), Android first, Google Maps through react-native-maps.
2. Control room: Next.js web console for the projector, plus a public report page opened by QR code.
3. API: NestJS with Postgres and PostGIS through Drizzle, and socket.io for live events.

**Engine boundary.** The phone app and the control room each run the same pure engine package on the same graph, incident snapshot, simulation clock and trip inputs, so they reach the same recommendation independently. The API owns incident persistence, validation, corroboration, operator actions, simulation events and live synchronization. It never returns a route recommendation or makes a routing decision; it may import the engine only for tests and the parity check. All three surfaces follow the same contracts package and scenario definitions.

**Non-negotiable rules**

- Routing decisions come only from the deterministic engine package. No LLM, no randomness and no hosted router in the decision path.
- Never present simulated data as real. Every incident shows its source (Simulated, User report, Operator) and status. Never show the words "safe", "safest", "guaranteed" or a safety percentage; use "recommended", "viable", "no reported hazards".
- Verified or corroborated impassable segments are hard constraints; a short travel time never overrides them.
- Incidents are the only shared state that drives routing. The server never sends routes; every client computes them with the engine. The demo vehicle's position is relayed for display only.
- No secrets in client code except Google Maps keys restricted by package name and SHA-1 or by HTTP referrer. Operator actions require a server-side token.
- Treat user text as plain text; never render it as HTML.
- Install Expo-managed native packages with `npx expo install` so versions match the SDK, and rebuild the dev client after adding any native package.
- Never claim a test passed unless you ran it. Report what is simulated, what is real and what is incomplete.
- Build every Must item before any Should or Stretch item (section 10).

**Also non-negotiable**

- Real roads, simulated conditions. Road geometry comes from OpenStreetMap; every flood, closure and congestion in the demo is simulated. Label the scenario as simulated in the app, the console, reports, the incident timeline and any shared or exported route text. Never imply that a real road is currently flooded or closed unless the information comes from a named external source.
- Show "Road data © OpenStreetMap contributors" wherever OSM-derived data appears, keep Google's attribution visible, and have the team confirm that overlaying OSM-derived routes on Google Maps fits both providers' terms before any public release.
- Device-based corroboration is a prototype heuristic, not proof of independent witnesses. Only an authorized operator action sets Verified. Client timestamps and device ids are never authoritative; the server assigns every time from the simulation clock.
- Domains, keys and hosts are configuration, not assumptions; the project must run fully locally without owning any domain (section 3, Configuration, domains and preflight).
- Correctness beats the clock: never trade route-engine correctness, the primary journey, the emergency simulation or testing for a time target, and never report an incomplete milestone as done.

## 2. Planning documents to write before any code

Spend the first 60 to 90 minutes writing these documents in `docs/`, in parallel with scaffolding. Every later prompt to an AI agent points at them, so agents stay consistent and stop re-deciding things. Keep the core of each document short (about two pages) and put detail in appendices or separate files (docs/design/, docs/contracts/, docs/briefs/). Generate what can be generated so values never drift: docs/scoring.md from SCORING\_RULES, and the payload reference from the Zod schemas. Every document in this table must exist in the repository, the tree in section 3 lists them all, and a document is updated in the same change as any decision it records.

| Order | Document | Must contain | Owner | Done when |
| --- | --- | --- | --- | --- |
| 1 | `docs/PRD.md` (product brief) | Problem, target user, the five questions VIGHNAWAY answers, primary journey, the three proofs for judges, Must, Should, Stretch and Out lists, success criteria, and the hackathon's judging criteria each mapped to a feature or demo moment | Pitch and QA | The team agrees on it in ten minutes |
| 2 | `docs/DESIGN.md` (design direction and system) | Everything in section 6: mood, principles, tokens, type, icon set, map style, route and marker specs, signature elements, motion specs, haptics, illustrations, app icon and splash, console look, copy rules, do and don't examples | Design lead (or the Mobile owner) | The tokens package is generated from it |
| 3 | `docs/UX_FLOWS.md` (screens and states) | Screen inventory, navigation map (drawer, modal routes, sheets), every state per screen (loading, empty, error, offline, stale, no viable route), exact copy for every banner, button, toast and error, and a low-fidelity sketch per screen | Mobile and Console | Every state has copy and a sketch |
| 4 | `docs/ARCHITECTURE.md` with short decision records | The architecture diagram, packages and their boundaries, the sync principle, and one-line reasons for each decision (Expo dev build, Google basemap, own engine, PostGIS, Drizzle, socket.io) | Platform | Every app's folder structure exists |
| 5 | `docs/CONTRACTS.md` (API and events) | Endpoints, payloads mirroring the Zod schemas, socket events, seq resync, error codes, operator auth | API | The contracts package compiles and matches it |
| 6 | `docs/DATA_MODEL.md` | Tables, indexes, the spatial queries, seed process, scenario file format | API and Data | The first migration runs |
| 7 | `docs/scoring.md` (engine rules) | Formula, constants, hard constraints, switching rule, confidence rules, explanation templates, test cases | Engine | Matches the `SCORING_RULES` export |
| 8 | `docs/demo-script.md` | Scenario, event timings, talk track, who taps what on which screen, reset procedure, fallback if the network fails | Pitch and QA | Rehearsed once on paper |
| 9 | `docs/TASKS.md` (work breakdown) | Every Must item as a task with owner, dependencies, acceptance check and gate | Platform | Every task has an owner |
| 10 | `AGENTS.md` (or `CLAUDE.md`) at the repo root | Links to every document above, commands, folder ownership, coding conventions, "do not touch without updating the doc" rules, a summary of section 8, and the definition of done | Platform | Every agent session starts by reading it |

**How AI agents work from these documents**

- Each agent session works in one app or package, reads `AGENTS.md` first, then only the documents its task needs.
- No agent changes contracts, tokens or scoring rules without updating the matching document in the same change and telling the team.
- UI is design-first: an agent builds a screen only after DESIGN.md and UX\_FLOWS.md define it. Build it static with fixture data first, review screenshots on a real phone against DESIGN.md, then wire live data.
- Every task ends with the agent stating which commands it ran and what passed, with screenshots for UI work.
- Definition of done: meets its acceptance check, uses only design tokens (no hard-coded colours or sizes), handles its loading, empty, error and offline states, passes the section 8.7 checklist if it is a phone screen, and has no console errors.

## 3. Architecture, repository and setup

```text
vighnaway/
  apps/
    mobile/          Expo app (expo-router): app/_layout.tsx, app/report.tsx, app/(drawer)/, src/
    console/         Next.js: app/console, app/report, app/rules
    api/             NestJS: scenarios/, incidents/, reports/, sim/, live/, db/, health/
  packages/
    engine/          graph, dijkstra, yen, evaluate, rank, explain, reachable, plan-trip, tests
    contracts/       Zod schemas, inferred types, socket event names, API payloads
    scenario-data/   andheri/graph.json, scenario.json, places.json, flood-prone.json
    tokens/          colours, type scale, spacing, route and marker styles
  infra/             docker-compose.yml (postgis/postgis + api), seed scripts
  scripts/           extract_graph.py (osmnx)
  docs/              PRD.md, DESIGN.md, UX_FLOWS.md, ARCHITECTURE.md, CONTRACTS.md, DATA_MODEL.md, scoring.md (generated), demo-script.md, TASKS.md, limitations.md, BUILD_PROMPT.md, briefs/, design/, contracts/
  AGENTS.md          shared agent rules (repository root)
```

**Tooling**

- pnpm workspaces and Turborepo; TypeScript strict mode everywhere; ESLint and Prettier.
- Workspace packages must resolve in Metro and in Next.js (transpilePackages). Follow Expo's monorepo guide for the installed SDK; if Metro cannot resolve workspace packages under pnpm, set `node-linker=hoisted` in `.npmrc`.
- The engine and contracts packages import nothing from React, React Native or Node built-ins, and have no side effects; they must run in Hermes, the browser and Node.

**Build order and gates**

1. Hours 0 to 2, foundations: the section 2 planning documents, written in parallel with scaffolding; monorepo; `docker compose up` gives Postgres with PostGIS; graph extract committed; contracts frozen; Expo dev build showing a styled Google map on a real Android phone. Gate: dev build on a phone, contracts frozen.
2. Hours 2 to 8, core in parallel: engine with tests; API reports, snapping, corroboration and gateway; app shell (providers, drawer, sheet, safe areas); the three hero screens built static with fixture data and locked after a phone review (section 6.10); console map. Gate: engine tests green, phone and console receive live events.
3. Hours 8 to 14, integrate: engine on phone and console; simulation runner; report flow end to end; banners, haptics and local notifications. Gate: the two-screen demo runs end to end.
4. Hours 14 to 18, complete: edge states, offline mode, vehicle profiles, reachable destination, SMS share; the section 8 checklist passes on two Android phones. Gate: feature freeze.
5. Hours 18 onward: bug fixes only, full test run, release APK on demo phones, rehearsal.

**Hours are planning targets, not promises.** Keep the architecture and the gate order, and check progress against acceptance criteria at every gate. If a gate is at risk, cut Stretch items first, then Should items that do not serve the demo. Never cut route-engine correctness, the primary journey, the emergency simulation or testing to hit a time, and never report an incomplete gate as passed.

**Expo dev build**

- Start from the default Expo Router template and add `expo-dev-client`.
- In `app.config.ts`: Android package and iOS bundle identifier (app.vighnaway for both); the react-native-maps config plugin with Android and iOS Google Maps keys read from environment variables; `expo-build-properties` with `android.usesCleartextTraffic: true` only if the demo API is reached over plain HTTP on the LAN; `expo-notifications`; `expo-location` permission strings; `expo-font`; portrait orientation.
- Build the dev client with `npx expo run:android` or an EAS `development` profile. Build the stage demo as an installable release APK (EAS `preview` profile or a local release variant) so it runs without Metro.
- Never test features in Expo Go.

**Google Maps**

- One Google Cloud project with billing enabled. Enable Maps SDK for Android, Maps SDK for iOS (only if iOS ships) and Maps JavaScript API.
- Android key: restrict to the package name plus the SHA-1 of every keystore that signs a build you will run (debug, EAS development, release). A grey map showing only the Google logo means a mismatch.
- Console key: a separate browser key restricted by HTTP referrer (localhost, the laptop's LAN address, vighnaway.app).

**Environment variables**

| Variable | Used by | Purpose |
| --- | --- | --- |
| GOOGLE\_MAPS\_ANDROID\_KEY, GOOGLE\_MAPS\_IOS\_KEY | app.config.ts | Native map keys |
| EXPO\_PUBLIC\_API\_URL | Mobile | Default API base URL; also editable in Settings |
| NEXT\_PUBLIC\_GOOGLE\_MAPS\_KEY, NEXT\_PUBLIC\_API\_URL | Console | Browser map key and API URL |
| DATABASE\_URL | API | Postgres connection |
| OPERATOR\_TOKEN | API, entered in the console | Shared secret for operator and simulation actions. Server-side only: never in an EXPO\_PUBLIC\_ or NEXT\_PUBLIC\_ variable or in git. The console asks for it at runtime and keeps it in sessionStorage, which is not a secure vault, so this is demo-grade access control |
| CORS\_ORIGINS | API | Allowed console origins |

**Configuration, domains and preflight**

- Every domain, URL and key is an environment variable: PUBLIC\_SITE\_URL, REPORT\_URL, API\_BASE\_URL (with EXPO\_PUBLIC\_API\_URL and NEXT\_PUBLIC\_API\_URL for the clients) and CORS\_ORIGINS. Proposed production values: https://vighnaway.app for the console, https://vighnaway.app/report for the report page, https://api.vighnaway.app for the cloud API, and app.vighnaway as the Android package and iOS bundle identifier. The product name in the UI is VIGHNAWAY.
- Do not assume that domain ownership, DNS, TLS certificates, Google Maps billing, API credentials or cloud hosting are already set up. The whole project must run locally from documented environment variables without the domain. The .app TLD is HTTPS-only, so any cloud service on it needs TLS; the laptop API on the phone hotspot keeps its LAN address.
- Add `pnpm preflight` and run it before every build or deploy. It lists missing or placeholder environment variables, checks that the database is reachable with PostGIS enabled, checks the API health endpoint, confirms CORS\_ORIGINS includes the console origin, prints the Android signing SHA-1 to add to the Google key, and fails if OPERATOR\_TOKEN appears in any EXPO\_PUBLIC\_ or NEXT\_PUBLIC\_ variable or in a committed file. Every failure prints its fix.

## 4. Shared engine and contracts

**contracts package.** Zod schemas and inferred types for RoadNode, RoadEdge, Incident, ReportInput, RouteEvaluation, Place, Scenario, ScenarioEvent, every REST payload, and the socket events `incident.upserted`, `sim.state` and `sim.reset`. The same schemas validate forms on the phone and console and requests in the API.

Also define two display-only events: `sim.tick` (simulation time, once per real second while playing) and `trip.position` (the demo vehicle: scenarioId, routeId, coordinate, heading, simulation time).

**engine package.** Pure functions only; time is always passed in as the simulation clock, never read from `Date.now()`.

- `loadGraph(json, profile)`: adjacency lists filtered by the profile's road access, with profile speeds per road class.
- `snapToNode(graph, point)`.
- `dijkstra(graph, from, to, weightFn)` with a binary heap.
- `yenKShortest(graph, from, to, k = 5, weightFn)`; drop any candidate sharing more than 80% of its length with a better one.
- `evaluate(route, incidents, ctx)` returns a RouteEvaluation (viability, ETA, cost, hazards, blockedBy).
- `rank(evaluations, previousRecommendation)` applies the switching rule and assigns roles: recommended, usual\_fastest, alternative, blocked.
- `explain(evaluation, others)` returns reason, trade-off, recheckIf and the confidence label.
- `findReachableDestination(graph, origin, places, incidents, profile)`.
- `planTrip(input)` orchestrates all of the above.
- Export `SCORING_RULES` (the constants below with plain-language descriptions). The console rules page and the app's How it decides screen render it, so documentation never drifts from code.

Performance: `planTrip` under 200 ms for a roughly 4 km by 3 km graph on a mid-range Android phone. Build adjacency once; memoise by incident-set hash, profile, origin and destination.

```latex
C(r) = \sum_{e \in r} t_e \, m_e + \sum_{i \in H(r)} P(s_i) \, w(v_i) \, f(a_i) + U(r)
```

| Constant | Value | Effect |
| --- | --- | --- |
| Congestion multiplier m | none 1.0, moderate 1.5, heavy 2.5, standstill 4.0 | Changes the ETA the user sees |
| Severity penalty P, seconds | low 60, medium 300, high 900 | Ranking only, never the shown ETA |
| Verification weight w | verified 1.0, corroborated 0.75, unverified 0.4, resolved or dismissed 0 | Scales the penalty |
| Age factor f | 1.0 under 30 min, falling linearly to 0.6 at 3 h | Older reports labelled Stale, never dropped |
| Data-gap penalty U | 120 s per continuous stretch of flood-prone edges with no report on any of its edges in the last 60 min while a rain alert is active | Ranking only |
| Impassable | Hard block if verified or corroborated; otherwise +1,800 s and a warning | Viability |
| Water depth | Ankle: penalty; knee or deeper: hard block once verified or corroborated | Viability, same for every profile |
| Switching rule | Keep the current recommendation unless it is not viable, or another route is cheaper by more than the larger of 120 s and 10% of the current cost | Stability |
| Confidence label | Defined by the decision table in Scoring definitions below | A label, never a probability |

**Engine tests (Vitest), all required:** normal trip with no hazards; verified closure on the fastest route; unverified flood report below the switching threshold; new incident blocking the selected route; no viable alternative; reachable destination found; profile change altering the route; stale report labelling; replay snapshot (same inputs, identical output); property checks that a more severe or more verified incident never lowers cost and that a change below the threshold never flips the recommendation.

**Scoring definitions (authoritative).** `SCORING_RULES` in the engine is the single source and docs/scoring.md is generated from it. Where this subsection and the constants table above differ, this subsection wins.

| Incident type | Reported condition | Status | Effect |
| --- | --- | --- | --- |
| Flood | Ankle | Any open status | Severity medium: 300 s × w × f ranking penalty; route stays viable |
| Flood | Knee or waist | Verified or corroborated | Hard block |
| Flood | Knee or waist | Unverified | +1,800 s ranking penalty and a visible warning; route stays viable |
| Flood | Depth not given | Any open status | Treated as knee depth (conservative) |
| Closure | Any | Verified or corroborated | Hard block |
| Closure | Any | Unverified | +1,800 s ranking penalty and a visible warning |
| Congestion | Moderate, heavy, standstill | Verified or corroborated | Multiplies edge travel time (1.5, 2.5, 4.0), so the displayed ETA changes |
| Congestion | Moderate, heavy, standstill | Unverified | Ranking penalty equal to the extra time it would add × 0.4; the displayed ETA does not change |
| Debris or accident | Low, medium, high | Any open status | 60, 300 or 900 s × w × f ranking penalty; hard block only if reported impassable and verified or corroborated |
| Road clear | Not applicable | Not applicable | Never resolves an incident by itself; marks it Conflicting (route confidence Low) until an operator resolves it or clear reports arrive from two different devices |
| Any | Not applicable | Resolved or dismissed | No effect; kept in history |

- **ETA versus ranking.** The displayed ETA is the sum of edge travel times with verified or corroborated congestion only. The ranking cost adds every penalty on top. The UI never shows ranking cost as time; it explains penalties in words ("avoids an unconfirmed flood report").
- **Data gap.** Applies only when a rain alert is active in the scenario, the edge is flood-prone, and no report covers that edge within the last 60 simulated minutes. It affects ranking only, never creates an incident, and appears as "No recent reports on \<road>", never as flooding. If the scenario has no alert information, no data-gap penalty applies and the note reads "No rain alert information".
- **Stale.** A report older than 3 simulated hours is labelled Stale and keeps age factor 0.6. Hard blocks from stale reports stay in force until an operator resolves them, and the route's confidence drops to Low.

| Confidence | Applies when (check Low first, then Medium; otherwise High) |
| --- | --- |
| Low | A conflicting incident on the route; viability relies on a stale report; the next viable route is within 60 s of ranking cost; or the plan is a forced reversal |
| Medium | An unverified incident on the route; a data gap on the route; alert information missing while the route uses flood-prone edges; or the next viable route is within 60 to 180 s |
| High | None of the above, including routes with no incidents and no flood-prone edges, or when no other viable route exists |

**Switching precedence**

1. If the selected route crosses a hard constraint on any edge not yet travelled, it is invalid immediately, whatever the threshold; choose the best viable route.
2. Otherwise keep it unless another viable route's ranking cost is lower by more than the larger of 120 s and 10% of the current cost. A gain exactly equal to the threshold does not switch.
3. Break remaining ties deterministically: cost, then distance, then route id.
4. Evaluation is idempotent: unchanged inputs never change the recommendation.
5. Every change records the triggering incident (id, type, status, source), why the previous route lost (invalid, or outperformed and by how much) and the trade-off of the new one. The banner and the activity entry show exactly these facts.

**Reversal rule.** `replanFrom` never returns a plan that reverses onto the current edge while any forward plan is viable. Only when no forward plan is viable may it return a reversal, labelled "Turn back only where it is safe to do so", with confidence Low. A lower modelled cost never makes a reversal safe, and the UI never says so.

**Boundary tests (add to the engine suite):** a gain exactly at the switching threshold (no switch) and 1 s above it (switch); two routes within rounding of each other; ties resolved by distance, then id; a report at exactly 3 h; a data gap at exactly 60 min; depth not given; unverified congestion leaving the ETA unchanged; a Road clear report producing Conflicting and Low confidence; a reversal only when no forward plan exists; repeated evaluation with identical inputs returning identical output.

**Determinism across phone, console and API.** The phone (Hermes) and the console (browser) must produce identical rankings, or the two screens will disagree on stage.

- Round every cost and ETA to whole seconds before comparing.
- Break ties in this order: lower cost, then shorter distance, then the lexicographically smaller route id (route id = its edge ids joined).
- Sort incidents by id before evaluating, iterate maps in sorted key order, and never rely on object key or Set iteration order.
- Parity check: a hidden debug screen on the phone and a /debug page on the console each show a hash of `planTrip` output for the fixture set; the two hashes must match.

**Re-planning en route.** `replanFrom(vehiclePosition, currentRoute, ...)` snaps the vehicle to its current edge and plans from that edge's end node, never backwards. Turning back onto the reverse of the current edge is a hard restriction while any forward plan is viable (see Scoring definitions). If the vehicle is already on a newly blocked edge, keep the route, show a prominent warning, and offer the plan from the nearest node ahead; tune the demo so this case never occurs on stage.

**Road graph preparation (`scripts/extract_graph.py`, Data and sim workstream)**

1. osmnx: build the graph for the Andheri bounding box with network type `all` so footways, footbridges and steps survive; simplify, and keep the largest connected component.
2. Keep tags: highway, oneway, junction, bridge, tunnel, layer, name, access, foot, motor\_vehicle.
3. Stable edge ids from OSM ids (`u-v-key`), one directed edge per travel direction; two-way roads produce two edges with reversed geometry.
4. Store each edge's coordinates in its direction of travel; when drawing a route, concatenate edge geometries in order and drop duplicate joint points.
5. Access per profile: car excludes footway, path, pedestrian, steps and motor\_vehicle=no; two-wheeler follows car access; on foot excludes roads where foot=no and includes footways, footbridges and steps.
6. Speeds per road class and profile are illustrative monsoon-traffic defaults, documented in `docs/scoring.md` (for example car: trunk 40, primary 30, secondary 25, residential 15 km/h; on foot 4.5 km/h).
7. flood\_prone = true for tunnels or negative layers under the railway, plus a hand-maintained list of way ids for named low-lying roads (`flood-prone.json`).
8. Write `graph.json` (nodes, edges, graph\_version hash) for the apps and generate the PostGIS seed from the same file.
9. Verify before hour 2: origin and destination connected for every profile; the three crossings present; the graph plotted over the Google basemap at the crossings with any drift fixed.

## 5. Backend: NestJS, Drizzle, PostGIS

**Modules:** DbModule, ScenariosModule, IncidentsModule, ReportsModule, SimModule, LiveModule (socket gateway), HealthModule.

**Database**

- Tables: road\_edges, places, incidents, incident\_reports, incident\_events, scenarios, sim\_runs (columns as in the plan's Data model section). Every incident change increments a per-scenario `seq` and appends an incident\_events row.
- Migrations with drizzle-kit. The first migration runs `CREATE EXTENSION IF NOT EXISTS postgis;`. Points use Drizzle's PostGIS geometry point type; road lines use a custom LineString type. Add GiST indexes on every geometry column.
- Seed road\_edges and places from the scenario-data package, so the database and the apps share one graph.
- Spatial queries: snap with `ST_DWithin(geom::geography, point::geography, 30)` ordered by `geom <-> point`; corroborate by counting distinct `device_hash` within 150 m and 30 simulated minutes; nearest destinations by `geom <-> point`.

**Report flow, one transaction**

1. Validate the body with the contracts schema (type, depth, point, observedPersonally, description up to 200 characters, deviceId).
2. Rate-limit per device and per IP with @nestjs/throttler.
3. Snap to the nearest road edge within 30 m; otherwise return 422 "Not on a known road".
4. Find an open incident of the same type within 150 m; attach the report to it or create a new Unverified incident.
5. If two or more distinct devices reported within 150 m and 30 simulated minutes, set the status to Corroborated.
6. Write the report, upsert the incident, increment seq and append the audit event in one transaction.
7. After commit, emit `incident.upserted` to the scenario room.

**Report semantics**

- Label device-based corroboration "Corroborated (2 devices)", never "confirmed": it is a prototype heuristic, not proof of independent witnesses.
- Only an operator action sets Verified. The Verified step in the demo is a simulated operator, labelled as such.
- The server assigns every timestamp from the simulation clock; client-supplied times and device ids are not authoritative evidence.
- Duplicates: another report from the same device within 150 m and 10 simulated minutes updates that device's earlier report instead of counting again.
- Late reports: a report about an incident that is already Resolved creates a new Unverified incident linked to the old one; it never silently reopens it.
- Conflicts: a Road clear report (add it to the report types) marks an open incident Conflicting; only an operator, or clear reports from two different devices, resolve it.

**Operator actions:** verify, resolve and dismiss require `Authorization: Bearer <OPERATOR_TOKEN>` and follow the same transaction-then-emit pattern.

**Simulation runner**

- Scenario events are ordered by `atS`. Play advances the simulation clock and applies each event through the same service methods that real reports and operator actions use; there is no special path for the demo.
- Step applies the next event; Pause stops the clock; Reset deletes the scenario's incidents, reports and events, reseeds fixtures, bumps seq and emits `sim.reset`.
- Deterministic: ids derive from scenario and step, timestamps from the simulation clock.

**Live gateway:** socket.io namespace `/live`; clients emit `join` with a scenarioId and receive events for that room. On every connect and reconnect, clients call `GET /scenarios/:id/incidents?sinceSeq=` before trusting the stream. CORS restricted to CORS\_ORIGINS.

**Simulation clock:** while playing, emit `sim.tick` with the simulation time once per real second. Run at a fixed speed-up (for example 1 simulated minute per 6 real seconds) so the whole script fits in about 90 seconds.

**Trip relay:** the phone emits `trip.position` at most once per second; the API keeps only the latest position per scenario in memory and rebroadcasts it to the room for the console. It never affects routing.

**Hygiene:** helmet, CORS allowlist, request size limits, Zod validation on every input, descriptions stored and returned as plain text, structured logs, `GET /health`. Docker compose runs the postgis/postgis image with a volume and health checks, plus the API.

## 6. Visual design, graphics and motion

The UI is the first thing judges touch, so it must feel like a calm, premium emergency instrument, never a hackathon dashboard. Concentrate the craft in three places they will remember: the map's look, the route-change moment, and the evidence on every recommendation. Write all of this into `docs/DESIGN.md` and the tokens package before building screens.

### 6.1 Direction and principles

- Mood: night-shift control room meets premium cartography. Deep navy map, one crisp teal route, warm off-white panels; amber and red appear only when something is wrong.
- The answer comes before the detail: ETA, route and one-line reason first; evidence one tap away.
- Evidence is always visible: source, status and age travel with every hazard.
- One accent per screen; colour is never the only signal (shape, line style and words always accompany it).
- Motion explains change; it never decorates.
- Avoid: gradients and glassmorphism, generic admin layouts, mixed icon sets, emoji, stock illustrations, exclamation marks, more than one bold colour fighting for attention.

### 6.2 Tokens

| Token | Value | Use |
| --- | --- | --- |
| shell | #0B1426 | Map base, console background, splash |
| panel | #F7F5F0 | Sheets, cards, dialogs |
| ink / ink-muted | #0F172A / #475569 | Text on panels |
| route-recommended | #14B8A6 | Recommended route, primary buttons |
| route-muted | #94A3B8 | Usual fastest and alternatives |
| warn | #F59E0B | Unverified hazards, cautions |
| danger | #DC2626 | Verified closures, Not viable |
| positive | #16A34A | Resolved, Reachable only |
| flood-prone | #38BDF8 at 35% opacity | Known-risk underlay on flood-prone segments |
| spacing | 4, 8, 12, 16, 24, 32 | 8-point grid |
| radius | sheet 20, card 14, chip 999, button 12 | Consistent shapes |
| type | Inter 32/700 ETA with tabular numerals, 18/600 titles, 15/400 body, 13/500 metadata | Numbers do not jitter when they change |

Ship one theme (navy map, light panels); a fully dark panel theme is Stretch. Lint for hard-coded colours outside the tokens package.

### 6.3 Map style

- Google custom style JSON: navy land, roads one step lighter with no colour, motorways slightly brighter, water a deeper blue, parks muted, labels light grey with a navy halo.
- Hide business and tourist points of interest; keep hospitals and shelters.
- Make the railway line clearly visible: it is the barrier the whole story is about.
- Never use teal, amber or red in the basemap; those colours belong to routes and hazards.
- Draw the flood-prone underlay (dotted, sky blue, low opacity) on flood-prone segments so judges see known risk before any incident arrives.
- Use the same palette on the console map.

### 6.4 Icons, markers and graphics

- One icon family everywhere: Lucide (lucide-react-native on the phone, lucide-react on the console).
- Five custom incident glyphs as SVG on Lucide's 24-unit grid with a 2-unit stroke: flood (droplet over waves), closure (barrier), congestion (stacked cars), debris, accident.
- Marker: glyph in a 36 px circle; ring by status (dashed Unverified, double Corroborated, solid Verified, grey with a strike for Resolved); a small age pill underneath ("12 min"); selected state scales to 1.15 with a soft shadow.
- Origin: a pulsing teal dot. Destination: a hospital pin with a cross.
- App icon and splash: a simple mark (a route line bending around an obstacle), teal on navy, with the VIGHNAWAY wordmark in Inter semibold, slightly letter-spaced, on the splash and first-run screen only; Android adaptive icon; navy splash with the centred mark (expo-splash-screen).
- Four small two-colour line illustrations in the same stroke style for: no incidents, offline, no viable route, report sent. Original artwork only.

### 6.5 Signature elements

1. **Route strip.** Every route card shows a slim horizontal strip of the route from origin to destination, with hazard ticks at their real positions and the crossing labelled (underpass, flyover, bridge). Judges compare routes at a glance. Build it with react-native-svg from the evaluation.
2. **Why this route card.** Three lines with icons: Avoids, Trade-off ("+6 min"), Re-check if. Always the same order and shape.
3. **Evidence chips.** Verified, Corroborated ("2 reports"), Unverified, Stale, and a Simulated badge, using the same ring language as the markers.
4. **Confidence meter.** Three segments with the word High, Medium or Low; never a percentage.
5. **The route-change moment.** The choreographed sequence in 6.6, identical on phone and console, so the room sees cause and effect.

### 6.6 Motion and haptics

| Moment | Motion | Timing | Haptic |
| --- | --- | --- | --- |
| App launch | Splash fades to the map; routes reveal from the origin outward | 600 ms ease-out | None |
| Evaluating | Route cards show a shimmer with "Checking 4 routes against 6 incidents" | Until done, at least 400 ms | None |
| Route change (hero) | Blocking segment flashes red twice; old route dims to slate and thins; new route fades in; camera eases to fit both; banner slides down from the sheet top; ETA rolls to the new value | About 900 ms in total | Warning notification |
| New incident | Marker drops in (scale 0 to 1.1 to 1) and its ring pulses twice | 350 ms spring | Light impact |
| Status upgrade | Ring morphs dashed to double to solid; chip cross-fades | 250 ms | Selection |
| Sheet snap | Spring with moderate damping, no bounce past the snap point | Spring | None |
| Primary button press | Scale to 0.97 | 100 ms | Light impact |
| Report sent | Button morphs into a check; toast "Sent. Shown as Unverified until confirmed." | 300 ms | Success |
| No viable route | Sheet expands, map dims to 40%, calm full-sheet message | 300 ms | Warning |

Implementation: Reanimated shared values with withTiming and withSpring, layout animations (FadeIn, FadeOut, LinearTransition) for list changes, react-native-svg for the route strip, the map's animated camera for fit-to-route. react-native-maps polylines cannot animate their stroke, so fake the reveal by adding coordinates progressively over about 600 ms, or cross-fade if that stutters on the test phone. Animate only transform and opacity, hold 60 fps on a mid-range Android phone, and make every animation instant when reduce motion is on.

### 6.7 Console look

- Same tokens on a navy shell; base text 18 px for the projector; generous spacing.
- Left: incident queue with status columns and evidence chips. Centre: the large map. Right: simulation controls, a live clock with tabular numerals, the demo trip's route cards with route strips, and a styled QR card for the report page.
- When an operator verifies, the incident card and its map marker pulse together, and the route cards play the same route-change motion as the phone.
- A thin event ticker along the bottom lists the last five changes in plain language.

### 6.8 Copy

- Short, calm, specific, numbers over adjectives: "Route changed. Andheri subway flooding confirmed by 2 reports. New route adds 6 min."
- Never alarmist, no exclamation marks, never "safe".
- All strings live in one i18n file so Hindi and Punjabi can be added without touching components.

### 6.9 Design QA before every gate

- [ ] Screens match DESIGN.md side by side on a real phone, not only in a simulator
- [ ] Only tokens used; one icon family; 8-point spacing respected
- [ ] Every state from UX\_FLOWS.md designed and reachable
- [ ] Contrast AA on panels and over the map; no information carried by colour alone
- [ ] Route-change sequence plays smoothly on the slowest demo phone
- [ ] Text fits at the largest system font size
- [ ] Phone and console show the same colours, chips and motion for the same event

### 6.10 Hero screens first

1. Before wiring any data, build three screens static with fixture data: Navigate with the sheet at peek (recommendation, route strip, evidence chips, vehicle marker); the route-change moment frozen mid-animation (banner, dimmed old route, new route); Report a hazard with the keyboard open.
2. Review them with the whole team on a real Android phone against DESIGN.md, fix what looks generic, and lock them by hour 8. Every other screen reuses their components.
3. Save screenshots of the locked versions in `docs/design/` as the visual reference for every later agent session.

## 7. Mobile app: Expo with expo-router

**Root providers, in this order**

```tsx
// apps/mobile/app/_layout.tsx
// expo-router already provides a SafeAreaProvider at the root: do not add another here.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <ThemeProvider value={navTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(drawer)" />
                <Stack.Screen name="report" options={{ presentation: 'modal' }} />
              </Stack>
            </ThemeProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
```

**Route tree**

```text
app/
  _layout.tsx             providers and root Stack
  report.tsx              Report a hazard (modal route)
  (drawer)/
    _layout.tsx           Drawer (swipe disabled on index)
    index.tsx             Navigate: map, sheet, banners
    activity.tsx          Journey-relevant changes
    settings.tsx          Profile, language, server address, offline data
    how-it-decides.tsx    Renders SCORING_RULES and limitations
```

**Navigate screen**

- MapView with `provider={PROVIDER_GOOGLE}`, the navy `customMapStyle`, `toolbarEnabled={false}`, `mapPadding` derived from safe-area insets and the sheet position, and `showsUserLocation` only after permission is granted.
- Overlays: route polylines styled by role, a cross marker on the blocking segment, incident markers (shape by type, ring by status, age label), origin and destination markers.
- Floating search card under the top inset, a drawer button, and profile chips (on foot, two-wheeler, car).
- One persistent @gorhom/bottom-sheet with peek (recommendation, ETA, reason, confidence), half (comparison cards) and full (details, activity) snap points.
- A Report button that moves with the sheet and stays above the bottom inset.
- A change banner that slides in at the top of the sheet, plus a screen-reader announcement.
- Incident evidence opens in a bottom sheet modal over the map.

**State and data**

- Zustand stores: scenario (graph, places), incidents (by id, lastSeq), trip (origin, destination, profile, evaluations, recommendation history), sim (state, simulation time). Select narrowly so the MapView does not re-render on unrelated updates; memoise polyline coordinate arrays.
- TanStack Query for REST. One socket.io-client instance that connects and disconnects with AppState; on every connect, fetch incidents since lastSeq.
- Offline: persist scenario, incidents, lastSeq and the last evaluation in MMKV; detect connectivity with @react-native-community/netinfo; show "Offline: using incidents from 14:12 (6 min old)". Queue reports while offline and send when back online, shown as Pending send.

**Recompute and alerts**

- When incidents, profile or trip change, run `planTrip` after interactions settle (debounced). If the recommendation changes: expo-haptics warning feedback, the banner, an activity entry, and, only when the app is in the background, a local notification with expo-notifications (trigger null). Remote push is not needed.
- Ask for notification permission after the first route is shown, not at launch. Location is foreground only through expo-location; the demo uses the scenario origin by default.

**Share:** build plain text (route name, ETA, turns from edge names, hazards avoided, evaluation time, the Simulated label) and open expo-sms when available, otherwise the system Share sheet.

**First-run screen:** one calm screen before the map with the VIGHNAWAY mark, "Simulated flood scenario: Andheri, Mumbai", one sentence on what the app does, and a Continue button. Ask for location and notification permissions only when first needed. A small Simulated badge stays in the map header all session.

**En-route mode:** after Start trip, advance a simulated vehicle along the recommended route using the simulation clock and each edge's travel time (including congestion). Show a vehicle marker with heading, the travelled part of the route in a darker tint, and the remaining ETA. On every incident change, re-plan with `replanFrom`, and play the route-change moment (section 6.6) from the vehicle's position. Publish `trip.position` for the console. Outside the demo, the same code path takes positions from expo-location instead of the simulator.

**When a dependency fails:** if the map cannot load (missing or rejected key, no network), keep the sheet, route cards, route strips, reasons and banners working over a plain navy background, and show an actionable message such as "Map unavailable: check the Google Maps key or the network". If the API is unreachable, keep routing on cached incidents with the offline banner. Never silently substitute mock behaviour for a failed real integration; anything simulated says so.

**Attribution:** show "Road data © OpenStreetMap contributors" on How it decides and in the map's attribution area, without covering Google's logo.

## 8. Expo UI rules: follow from the first screen

Most Expo apps that look broken in demos fail on these six things, almost always on Android. Treat every rule below as a requirement, and run the checklist at the end of this section before every gate.

### 8.1 Safe areas and edge-to-edge

- Edge-to-edge is always on for Android in current Expo SDKs: the app draws behind the status bar and the navigation bar, so every screen must apply insets deliberately.
- Use react-native-safe-area-context only. Never import SafeAreaView from `react-native`, and never use `StatusBar.currentHeight`.
- expo-router already provides a SafeAreaProvider at the root. Do not add another, except at the root of a React Native `Modal` (a separate native window).
- Full-bleed map screen: do not wrap the MapView in a SafeAreaView. Place floating UI with `useSafeAreaInsets()` (search card at `insets.top + 8`, Report button above the sheet and `insets.bottom`), and set the MapView's `mapPadding` so the Google logo and map controls are never under the status bar, the sheet or the navigation bar.
- Screens with a navigation header: the header already handles the top inset. Use `SafeAreaView edges={['bottom', 'left', 'right']}` there to avoid double top padding.
- Lists: put `insets.bottom` in `contentContainerStyle.paddingBottom`, not on the container, so content scrolls under the navigation bar while the last item stays reachable.
- Status bar icon colour: set it per screen with expo-status-bar (light over the navy map, dark over light panels). Do not set status bar background colours; they are unavailable edge-to-edge.
- Test with gesture navigation and with three-button navigation; they produce different bottom insets.

### 8.2 Drawer

- Use expo-router's Drawer layout (React Navigation drawer). It needs react-native-gesture-handler and react-native-reanimated, and the whole app must sit inside one GestureHandlerRootView at the very top of the root layout.
- Set `swipeEnabled: false` on the Navigate screen so map pans and sheet drags never open the drawer. Open it from the menu button. Other drawer screens may keep the swipe.
- Drawer content: use DrawerContentScrollView (it applies the top inset) and add `insets.bottom` to the footer (version, data status).
- Close the drawer before navigating to a modal route: `navigation.closeDrawer()`, then `router.push('/report')`, so two animations never run at once.
- Keep the drawer's default keyboard dismissal on drag; use drawer type `front` with an overlay and a width of `min(320, 80% of screen width)`.

### 8.3 Dialogs and modals

- Prefer navigator modals: expo-router screens with `presentation: 'modal'` (Report a hazard) or `'transparentModal'` for custom dialogs. They inherit the safe-area, gesture and keyboard providers.
- Simple confirmations ("Discard this report?", "Switch server?") use `Alert.alert`, not custom components.
- If React Native's `Modal` is unavoidable:
  - set `statusBarTranslucent` and `navigationBarTranslucent` to true on Android;
  - wrap its content in its own SafeAreaProvider, because the root provider's insets do not reliably reach a separate native window;
  - wrap its content in GestureHandlerRootView, or gesture-handler buttons and sheets inside it will not respond on Android;
  - implement `onRequestClose` for the Android back button.
- Never open a second modal or an Alert while another modal is presenting or dismissing: iOS presents only one at a time and drops the other. Chain the second one after the first has closed.
- Bottom sheet modals render through the root BottomSheetModalProvider and do not appear above a native modal screen. Never open a sheet modal from inside the Report route.
- Close sheets and dialogs with the Android back button (a small `useBackToClose` hook around BackHandler).
- Auto-focus inputs in a modal only after its open transition finishes, or the keyboard jumps mid-animation.

### 8.4 Keyboard avoiding

- Use react-native-keyboard-controller and wrap the app in its KeyboardProvider (inside GestureHandlerRootView). Edge-to-edge breaks Android's `adjustResize`, and React Native's built-in KeyboardAvoidingView behaves inconsistently on Android.
- Forms (Report a hazard, server address in Settings): keyboard-controller's KeyboardAwareScrollView with a small `bottomOffset` and `keyboardShouldPersistTaps="handled"`, so tapping Send does not just dismiss the keyboard.
- The bottom-anchored primary button ("Send report") sits in a KeyboardStickyView so it rides above the keyboard, with `insets.bottom` padding when the keyboard is closed.
- If a KeyboardAvoidingView is needed, use keyboard-controller's drop-in with `behavior="padding"` and `keyboardVerticalOffset` equal to the header height (`useHeaderHeight()`). Never nest one inside another or inside a ScrollView.
- Map search card: dismiss the keyboard on map press, on sheet drag and when the drawer opens.
- Avoid TextInput inside a bottom sheet. If it is unavoidable, use BottomSheetTextInput with `keyboardBehavior` `interactive` on iOS and `extend` on Android, `android_keyboardInputMode="adjustResize"`, `keyboardBlurBehavior="restore"`, and a high snap point; sheets at low snap points are known to close when the Android keyboard opens.

### 8.5 Bottom sheets

- One persistent BottomSheet on Navigate. Use BottomSheetScrollView or BottomSheetFlatList inside it, never a plain ScrollView.
- Pass `topInset={insets.top}` and `bottomInset={insets.bottom}` (or build them into the snap points) so the peek never hides under the navigation bar and the full position stops below the status bar.
- Fixed snap points with `enableDynamicSizing={false}` for the main sheet; dynamic sizing for small evidence sheets.
- Give the sheet an opaque background so touches never fall through to the map.
- Drive the Report button position and the map padding from the sheet's `animatedPosition`.
- Before writing sheet code, confirm the installed @gorhom/bottom-sheet version supports the installed Reanimated major version.

### 8.6 Map overlays (react-native-maps with Google)

- Always set `provider={PROVIDER_GOOGLE}`; iOS defaults to Apple Maps otherwise.
- Custom-view markers: set `tracksViewChanges` to false after the first render (true only while an image loads), or markers flicker and the Android JS thread stalls.
- Memoise coordinates and overlays; never recreate every overlay on each store update.
- Dashed Not viable lines: `lineDashPattern` works on Android with the Google provider; on iOS with Google, fall back to red plus the cross marker and the Not viable label.
- Z-order from bottom to top: alternatives, usual fastest, recommended, blocking marker, incident markers.
- Keep the Google logo visible at every sheet position.

### 8.7 Verification checklist

- [ ] Nothing hides under the status bar or navigation bar on any screen, with gesture and with three-button navigation
- [ ] The Google logo is visible at every sheet position
- [ ] Panning the map never opens the drawer; the menu button opens it and Back closes it
- [ ] With the keyboard open on a 360 dp phone, every Report field and the Send button stay visible
- [ ] Android Back closes, in order: keyboard, dialog, sheet modal, modal route, drawer
- [ ] No modal or Alert opens while another is animating
- [ ] The sheet peek sits fully above the navigation bar and the Report button moves with the sheet
- [ ] At the largest system font size, nothing is clipped in the peek or the banner
- [ ] Release APK: map renders, API reachable, local notification shows when backgrounded

## 9. Web control room and report page

Next.js App Router, Tailwind CSS, shadcn/ui, @vis.gl/react-google-maps, TanStack Query, Zustand and socket.io-client, importing the same engine and contracts packages (listed in `transpilePackages`).

**/console** (operator; the token is entered once and kept in sessionStorage), designed for 1920 by 1080 on a projector:

- Left column: incident queue grouped by status, newest first. Each card shows type, depth, source, age and report count, with Verify, Resolve and Dismiss buttons that update optimistically and roll back on error.
- Centre: a Google map with every incident and the demo trip's routes, computed in the browser with the engine and styled exactly like the phone.
- Right column: Play, Pause, Step and Reset; the simulation clock; the demo trip's evaluated routes with their reasons; a QR code that opens /report.
- Projector legibility: base text 18 px, high contrast, no information available only on hover.
- On disconnect show "Reconnecting", then resync by seq.

**/report** (public, mobile web): incident type, depth pictograms (ankle, knee, waist), a pin on a small map or "Use my location", an optional note and "I saw this myself". Keep a random device id in localStorage, validate with the contracts schema, and confirm with "Sent. Shown as Unverified until confirmed."

**/rules**: renders `SCORING_RULES` from the engine package, plus the known limitations.

**Failures and attribution:** when the map key, network or API fails, the console shows the same actionable errors as the phone and keeps the incident queue and route cards usable. Show the OpenStreetMap attribution next to Google's.

## 10. Demo scenario, design summary, scope, testing and delivery

**Scenario (Andheri, Mumbai):** an area of roughly 4 km by 3 km split by the Western Railway line. Origin in Andheri East; destination a hospital on the West side; an alternative hospital on the East side; real names from the OSM extract. Route A through Andheri subway (fastest, flood-prone), Route B over a flyover (congestion-prone), Route C via a farther crossing (longest, clear). Tune fixtures so A beats B and B beats C by about 4 to 6 minutes each. Simulation clock starts at 14:05 IST with a rain alert, labelled Simulated.

**Event script**

1. 14:05: scenario loads; A recommended with confidence Medium (data gap at the underpass). The user taps Start trip and the vehicle sets off along A.
2. 14:07: one ankle-deep report at the underpass ahead; penalty only; A stays; activity reads "Route unchanged: one unverified report".
3. 14:10: a knee-deep report from a second device (a judge by QR, or scripted); Corroborated; A is not viable ahead of the vehicle; VIGHNAWAY re-plans from the vehicle's position onto B; the phone buzzes and explains.
4. 14:12: the operator taps Verify on the console; status Verified.
5. 14:15: heavy congestion on the flyover ahead; re-plan from the vehicle onto C if it beats B by more than the threshold; second buzz and banner.
6. 14:18 (optional): the road into the hospital closes; "No viable route"; nearest reachable hospital offered with "In an emergency, call 112".

Tune vehicle speed and event times so the vehicle is still before the underpass at 14:10 and before the flyover ramp at 14:15.

**Design system summary (full direction in section 6)**

- Colours: shell #0B1426, panel #F7F5F0 (dark #111C33), ink #0F172A, recommended route #14B8A6, muted route #94A3B8, warning #F59E0B, danger #DC2626, positive #16A34A (only for Resolved and Reachable).
- Type: Inter via expo-font and next/font. ETA 32 bold, route name 18 semibold, body 15, metadata at least 13; respect system font scaling.
- Routes: recommended 6 px teal with a dark casing; usual fastest 4 px slate; alternatives 3 px slate at 60% opacity; not viable 4 px red, dashed where supported, with a cross marker.
- Incident markers: shape by type (droplet flood, barrier closure, cars congestion, triangle accident or debris), ring by status (dashed Unverified, double Corroborated, solid Verified, grey struck-through Resolved), age label.
- Motion: 200 to 300 ms with Reanimated; a light haptic on route change; instant when reduce motion is on.
- Never colour alone: every state also has a shape, line style or word.

**Scope**

- Must: monorepo; dev build with Google map; first-run screen; three locked hero screens; graph extract and seed; engine with tests; API reports, snapping, corroboration, operator actions, gateway with seq resync; simulation runner; app shell meeting section 8; Navigate screen; en-route mode with re-planning and trip relay; evidence sheet, banner, haptic, local notification; Report modal; control room; report page; edge states; tests; release APK and backup video.
- Should: vehicle profiles; reachable destination; SMS share; offline mode.
- Stretch: iOS build; evacuation load spreading; Hindi and Punjabi strings; read-only SACHET alert banner.
- Out: accounts, ML forecasting, LLM routing decisions, dispatch, Expo Go.

**Testing**

- Engine: the Vitest suite in section 4.
- API: Jest with supertest against a test database: report, second report corroborates, same device does not corroborate, verify, reset, and the matching socket events.
- Mobile: Jest with React Native Testing Library for the sheet peek, banner and report form validation; one Maestro flow (launch, see the recommendation, open Report, submit).
- Manual: the section 8.7 checklist on two Android phones (gesture and three-button navigation).

**Test harness (set up in hour 2, before anyone writes a component test):** Jest with the jest-expo preset, plus mocks for react-native-maps (a plain View that records overlays), react-native-reanimated, react-native-gesture-handler, @gorhom/bottom-sheet, react-native-safe-area-context, react-native-keyboard-controller and react-native-mmkv. Use each library's official Jest mock where it ships one and a minimal manual mock otherwise.

**Also test:** en-route re-planning never routes backwards unless nothing else is viable; the phone and console debug hashes match for the fixture set.

**Dependency failure tests (required before acceptance):** run the core route-planning and simulation flow with an invalid Google Maps key, with the API stopped, and with the network off. Each run must show its fallback or an actionable error and keep route planning working; none may leave the demo unusable.

**Demo-day build**

- Release APK on two Android phones; the release keystore SHA-1 on the Google key.
- API and database in Docker on the laptop, console on the laptop, every device on a phone hotspot; cleartext enabled for that build or the API served over HTTPS.
- A cloud copy of API and console as backup, selectable in the app's Settings.
- Phone mirrored to the projector with scrcpy beside the console; Reset between judges.

**When you finish, report:** what was built; exact commands to install, run, test and build; environment variables; what is real and what is simulated; which tests ran and their results; known limitations; anything incomplete. Never describe untested behaviour as working.

**Final acceptance.** The build is accepted only after an end-to-end run in which the fastest route is selected first; a reported incident changes route evaluation according to its evidence and severity; the recommendation changes only when the documented rules justify it; the new recommendation shows its reason and evidence on both the phone and the console; and reset followed by replay produces identical results from the same inputs. The final report separates verified test results, simulated behaviour, untested behaviour and incomplete work.
