# CONTRACTS.md: API and events

Owner: API (Engine reviews). Source of truth: `packages/contracts/src`. This file mirrors it; change
both in the same commit and flag it in your final report. Base URL: `API_BASE_URL` (clients:
`EXPO_PUBLIC_API_URL`, `NEXT_PUBLIC_API_URL`). All bodies are JSON. All times are **simulation
seconds** (`…S` fields) assigned by the server.

## REST

| Method and path | Auth | Body / query | Response |
| --- | --- | --- | --- |
| `GET /health` | none | | `HealthResponse { ok, db, postgis, graphVersion, version }` |
| `GET /scenarios` | none | | `ScenarioListResponse { scenarios: ScenarioSummary[] }` |
| `GET /scenarios/:id` | none | | `ScenarioResponse { scenario: Scenario, sim: SimState }` |
| `GET /scenarios/:id/incidents` | none | `?sinceSeq=n` (optional) | `IncidentsResponse { scenarioId, seq, full, runId, simTimeS, incidents, observations? }` |
| `POST /scenarios/:id/reports` | none (throttled) | `ReportInput` | `201 ReportResponse { receipt, incident \| null }` |
| `POST /scenarios/:id/audience/clear` | Bearer | `{}` | `ClearAudienceResponse { cleared, incidentIds }`: dismisses every open incident supported only by audience reports (one logged change each, broadcast like any change); scripted and mixed-origin incidents stay |
| `POST /scenarios/:id/incidents/:incidentId/verify` | Bearer | `{ note? }` | `OperatorActionResponse { incident }` |
| `POST /scenarios/:id/incidents/:incidentId/resolve` | Bearer | `{ note? }` | same |
| `POST /scenarios/:id/incidents/:incidentId/dismiss` | Bearer | `{ note? }` | same |
| `GET /scenarios/:id/sim` | none | | `SimResponse { sim }` |
| `POST /scenarios/:id/sim/play` · `pause` · `step` · `reset` | Bearer | `{}` | `SimResponse { sim }` |
| `GET /operator/check` | Bearer | | `204` or `401` |
| `GET /scenarios/:id/history` | none | | `HistoryResponse { scenarioId, runId, resetSeq, entries: { seq, atS, kind, summary, incident }[] }`: every incident change of the current run with the incident after it; `incidentsAtSeq(entries, seq)` rebuilds any moment for decision replay |
| `GET /scenarios/:id/feed` | none | | `FeedStatus` (live traffic feed; see docs/live-traffic.md) |
| `POST /scenarios/:id/feed/poll` | Bearer | | `{ result, status }`; 409 for non-live scenarios or when the feed is off |

`full: true` means replace the local incident set (no `sinceSeq`, `sinceSeq` older than the last
reset, or `sinceSeq` ahead of the server's `seq`); otherwise merge by id. Incidents in the response
are those whose `seq > sinceSeq` (a full response returns every incident of the run, closed ones
included). `GET /health` answers 503 with the same `HealthResponse` body when `ok` is false.

Path ids that do not match the id pattern, and unknown operator or simulation actions, are 404.
Operator `verify` on an open incident (including an already Verified one) succeeds and clears
`conflicting`; any action on a Resolved or Dismissed incident is 409.

### ReportInput (`ReportInputSchema`)

```ts
{ type: 'flood'|'closure'|'congestion'|'debris'|'accident'|'road_clear',
  depth?: 'ankle'|'knee'|'waist'|null,        // flood only; null/absent = not given
  congestion?: 'moderate'|'heavy'|'standstill', // required for congestion
  severity?: 'low'|'medium'|'high'|null,        // debris / accident only
  impassable?: boolean,
  point: { lat, lng },
  observedPersonally: boolean,
  origin?: 'app'|'web'|'audience'|'prompt',    // labels and limits only, never evidence; absent = app
  description?: string (≤ 200, plain text),
  deviceId: string (8–64, [A-Za-z0-9_-]) }      // strict: unknown keys rejected, no timestamps
```

**Origin.** `audience` is a demo-audience phone that scanned the presenter QR code (`/report?audience=1`). An
incident is `audienceOnly` while every supporting report is `audience`; the console lists it with a "Demo audience"
chip and the operator can clear them all with `POST /audience/clear`. `prompt` is an answer to "Is <road> flooded
right now?" at a data gap: at most one answer per road (the snapped edge, its twin or any edge with the same name) per
device per 30 simulated minutes, else `409 CONFLICT`; a prompt Road clear may mark an incident Conflicting but never
resolves it, and a prompt flood report is an ordinary Unverified incident.

**Observations (`IncidentsResponse.observations`).** The latest report time per flood-prone edge from any report,
Road clear included (a Road clear with nothing nearby creates no incident), as `{ edgeId, lastObservedAtS, kind:
'hazard' | 'clear' }`, both directions of a two-way road. It is the current state, not versioned by seq and not in
`/history`. It lets a client tell "no reports" from "reports say clear"; it never removes a hazard penalty or a block.

`ReportReceipt { reportId, scenarioId, outcome, receivedAtS, snappedEdgeId, roadName,
distanceToRoadM }`, outcome ∈ `created_incident | attached | updated_duplicate | corroborated |
marked_conflicting | resolved_by_clear_reports | clear_noted | linked_new_incident`.

### Incident (`IncidentSchema`)

`id, scenarioId, type, status (unverified|corroborated|verified|resolved|dismissed), source
(simulated|user_report|operator|live_feed), depth, congestion, severity, impassable, conflicting, edgeIds
(sorted, both directions), point, roadName, reportCount, deviceCount, createdAtS, lastReportAtS,
updatedAtS, verifiedAtS, verifiedBy (operator|simulated_operator), closedAtS, linkedIncidentId,
note, seq`.

## Errors

`{ error: { code, message, details? } }`

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Body or query fails its Zod schema (`details` = issues) |
| `UNAUTHORIZED` | 401 | Missing or wrong `Authorization: Bearer <OPERATOR_TOKEN>` |
| `NOT_FOUND` | 404 | Unknown scenario or incident |
| `CONFLICT` | 409 | Operator action on a closed incident, or a second `prompt` answer for the same road from one device within 30 simulated minutes |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 16 kB |
| `NOT_ON_ROAD` | 422 | Report point more than 30 m from any road edge ("Not on a known road") |
| `RATE_LIMITED` | 429 | `POST /reports` only: more than 10 requests/min per IP or 5 reports/min per device |
| `INTERNAL` | 500 | Anything else (logged, never leaks internals) |

## Socket.io

Namespace `/live` (`LIVE_NAMESPACE`). CORS restricted to `CORS_ORIGINS`.

| Event | Direction | Payload |
| --- | --- | --- |
| `join` | client → server, with ack | `{ scenarioId }` → ack `{ ok, seq, runId }` |
| `incident.upserted` | server → room | `{ scenarioId, seq, incident, summary }` |
| `sim.state` | server → room | `SimState { scenarioId, runId, state, simTimeS, nextEventIndex, eventCount, simSecondsPerRealSecond, seq }` |
| `sim.tick` | server → room, 1/s while playing | `{ scenarioId, runId, simTimeS }` |
| `sim.reset` | server → room | `{ scenarioId, runId, seq }` |
| `trip.position` | phone → server → room (display only) | `TripPosition { scenarioId, routeId, coordinate, headingDeg, simTimeS, edgeId, edgeFraction, profile, destinationId, edgeIds, travelledEdgeCount, status }` |

`join` refuses an unknown scenario with ack `{ ok: false, error: { code, message } }`; a socket is
in one scenario room at a time. `trip.position` is accepted only from a socket that joined that
scenario, at most once per ~1 s per socket (ack `{ ok: true }`, or `{ ok: false, error }` with
`VALIDATION_FAILED`, `UNAUTHORIZED` or `RATE_LIMITED`); it is relayed to the rest of the room
(not echoed to the sender) and forgotten on reset.

**Simulation states.** `idle` after a reset (clock 0, nothing applied); `playing` while the clock
runs; `paused` after pause or step with events left; `finished` after pause or step once every
event is applied. The clock keeps running after the last event while `playing`
(`nextEventIndex === eventCount`) so the phone's simulated vehicle can finish its trip; `play` from
`finished` resumes it. Step applies exactly one event, moving the clock to that event's `atS`.
A server restart turns a persisted `playing` clock into `paused` (or `finished`). Scripted events
use their `atS` as server time; a real report gets the clock's last published `simTimeS`.

**Resync rule.** On every connect and reconnect: emit `join`, then `GET /incidents?sinceSeq=<lastSeq>`
before trusting the stream. Apply `incident.upserted` only if `seq > lastSeq`; on a gap
(`seq > lastSeq + 1`) resync. On `sim.reset` clear incidents and resync with no `sinceSeq`. The API
keeps only the latest `trip.position` per scenario in memory and sends it to a client when it joins.

## Operator auth

`OPERATOR_TOKEN` is server-side only. The console asks for it at runtime, keeps it in
sessionStorage (demo-grade, not a vault) and sends `Authorization: Bearer <token>`. Comparison is
constant-time. `pnpm preflight` fails if the token appears in any `EXPO_PUBLIC_`/`NEXT_PUBLIC_`
variable or committed file.

## Live mode and the live traffic feed

`Scenario.mode` is `simulated` (scripted demo, everything labelled Simulated) or `live`
(`andheri-live`: wall-clock time in `simTimeS` = seconds since `clockStartsAt`, no events,
`sim/*` controls answer 409, nothing labelled Simulated). Incidents with `source: 'live_feed'`
carry `feed: FeedRef { provider: 'tomtom', externalId, delayS, magnitude, probability,
description, from, to, lastSeenAtS }`; label them with `statusLabel`/`sourceLabel` ("Reported by
TomTom live traffic" / "TomTom live traffic"). Details: docs/live-traffic.md.

## Structured engine text (`Text`)

The engine's result shapes (`PlanResult` and its parts, produced on the client, never sent by the
server) carry every sentence twice: as the English string they always had, and as structured
`Text = { key, params? }` in an optional companion field. `params` values are numbers, proper nouns
(road and place names, never translated) or nested `Text`. Clients render a `Text` in the user's
language with `renderText(text, 'en' | 'hi' | 'mr')` from `@vighnaway/engine`; the catalogs are
`packages/engine/src/text/{en,hi,mr}.ts` and the English string stays the source of truth.

| Shape | English field | Text companion |
| --- | --- | --- |
| `RouteEvaluation` | `name` | `nameText` |
| `Explanation` | `reason`, `tradeOff`, `recheckIf`, `confidenceReasons[]` | `reasonText`, `tradeOffText` (absent when `tradeOff` is empty), `recheckIfText`, `confidenceReasonTexts[]` |
| `RouteChange` | `message`, `tradeOff` | `messageText`, `tradeOffText` (absent when `tradeOff` is empty) |
| `PlanNotice` | `message` | `messageText` |
| `RouteEvaluation` (not recommended) | (none: structured only, see below) | `counterfactualText` |

`nextActionText(plan, destinationName?)` gives the "what to do now" sentence the same way, and
`ruleDescription(key, lang)` gives scoring-rule descriptions. Case modifiers in a template
(`{hazard|lower}`) apply to English only.

The companions are not part of the decision: `planHash` and the parity hash ignore them
(`stripText`), so the parity hash is unchanged by this contract. They are optional so older
payloads still parse; a client without a `Text` shows the English string.


### Counterfactual (`RouteEvaluation.counterfactual`)

Every shown route that is not recommended carries `counterfactual`, the answer to "why not that
route?", and `counterfactualText` (its sentence). The recommended route has neither. Kinds:

| `kind` | Fields | Meaning |
| --- | --- | --- |
| `blocked` | `blockerIds`, `wouldBeRecommended` | Not viable while these incidents stand; a faster ETA never changes that. `wouldBeRecommended`: clearing all of them would make it the recommendation. |
| `hazards` | `incidentIds`, `smallest` | Clearing these incidents would make it the recommendation. `smallest` is true only for a single incident. |
| `time` | `cutS` | It would be the recommendation if its ranking cost were `cutS` seconds lower (switching rule included). |
| `none_sufficient` | `reason` (`hazards` or `time`) | Clearing its hazards, or saving any time, would not be enough. |

Each claim is verified by re-ranking all candidates (docs/scoring.md, "How counterfactuals are
computed"). `counterfactual` is part of the plan hash and the parity hash, so the parity hash
changed when it was added (see docs/ROADMAP_STATUS.md for the values); `counterfactualText` is not.
