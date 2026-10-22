# DATA_MODEL.md

Owners: API and Data. Schema: `apps/api/src/db/schema.ts` (Drizzle); migrations in
`apps/api/drizzle/`. The first migration runs `CREATE EXTENSION IF NOT EXISTS postgis;`. All
geometries are SRID 4326 with a GiST index. All `*_s` columns are simulation seconds.

## Tables

| Table | Key columns | Indexes |
| --- | --- | --- |
| `road_edges` | `id` text PK (`u-v-key`), `graph_version`, `from_node`, `to_node`, `reverse_id`, `way_id`, `name`, `highway`, `oneway`, `bridge`, `tunnel`, `layer`, `length_m`, `flood_prone`, `geom` LineString | GiST(`geom`), (`graph_version`, `name`) |
| `places` | `id` PK, `scenario_id`, `name`, `kind`, `node_id`, `side`, `address`, `geom` Point | GiST(`geom`) |
| `scenarios` | `id` PK, `name`, `graph_version`, `definition` jsonb (Scenario), `seq` int, `reset_seq` int, `reset_count` int, `run_id`, `sim_state`, `sim_time_s`, `next_event_index` | |
| `incidents` | `id` PK, `scenario_id`, `type`, `status`, `source`, `depth`, `congestion`, `severity`, `concern` (walking_concern only), `impassable`, `conflicting`, `edge_ids` text[], `road_name`, `report_count`, `device_count`, `created_at_s`, `last_report_at_s`, `updated_at_s`, `verified_at_s`, `verified_by`, `closed_at_s`, `linked_incident_id`, `note`, `seq`, `geom` Point, `feed` jsonb (FeedRef for source live_feed) | GiST(`geom`), (`scenario_id`, `seq`), (`scenario_id`, `type`, `status`) |
| `incident_reports` | `id` PK, `scenario_id`, `incident_id` (null for a Road clear with nothing nearby), `type`, `depth`, `congestion`, `severity`, `concern`, `impassable`, `observed_personally`, `description`, `device_hash`, `ip_hash`, `source`, `origin` (app, web, audience or prompt; default app), `user_id` (signed-in reporter, null when anonymous; migration 0004), `received_at_s`, `snapped_edge_id`, `distance_to_road_m`, `geom` Point | GiST(`geom`), (`scenario_id`, `device_hash`), (`incident_id`) |
| `incident_events` | `id` bigserial PK, `scenario_id`, `seq`, `incident_id`, `kind`, `actor`, `at_s`, `summary`, `payload` jsonb | unique(`scenario_id`, `seq`) |
| `users` | `id` PK, `email` unique (lower-cased), `role` (citizen, operator or admin), `display_name`, `disabled`, `created_at`, `last_login_at` | unique(`email`) |
| `auth_otps` | `id` PK, `email`, `code_hash` (HMAC of email + code), `client`, `ip_hash`, `attempts`, `created_at`, `expires_at`, `consumed_at` | (`email`, `created_at`), (`ip_hash`, `created_at`) |
| `auth_sessions` | `id` PK, `user_id`, `token_hash` unique (sha256), `client`, `created_at`, `expires_at`, `revoked_at` | (`user_id`) |
| `sim_runs` | `id` PK (run id), `scenario_id`, `status`, `started_wall`, `ended_wall`, `events_applied` | |

Every incident change runs in one transaction: `UPDATE scenarios SET seq = seq + 1 … RETURNING
seq` (the row lock serialises writers), write the report, upsert the incident with that `seq`,
append one `incident_events` row. `incident.upserted` is emitted only after commit.

Device ids are never stored raw: `device_hash = sha256(DEVICE_HASH_SALT + deviceId)`, likewise
`ip_hash`. Descriptions are stored and returned as plain text.

## Spatial queries

```sql
-- Snap: nearest edge within 30 m (geodesic distance first, then planar KNN, then id for ties)
SELECT id, reverse_id, name, ST_Distance(geom::geography, $pt::geography) AS d
FROM road_edges
WHERE graph_version = $v AND ST_DWithin(geom::geography, $pt::geography, 30)
ORDER BY d, geom <-> $pt, id LIMIT 1;

-- Extent: same named road near the point (60 m, or 600 m for congestion), both directions
SELECT id FROM road_edges
WHERE graph_version = $v AND name = $name AND ST_DWithin(geom::geography, $pt::geography, $extent);

-- Attach: an open incident of the same type with a report within 150 m
-- (Road clear reports never count as an incident's supporting reports in these queries)
SELECT DISTINCT i.id FROM incidents i
JOIN incident_reports r ON r.incident_id = i.id AND r.type <> 'road_clear'
WHERE i.scenario_id = $s AND i.type = $t AND i.status IN ('unverified','corroborated','verified')
  AND ST_DWithin(r.geom::geography, $pt::geography, 150)
ORDER BY i.id LIMIT 1;

-- Corroborate: distinct devices within 150 m and 30 simulated minutes
SELECT count(DISTINCT device_hash) FROM incident_reports
WHERE incident_id = $i AND received_at_s >= $now - 1800
  AND ST_DWithin(geom::geography, $pt::geography, 150);

-- Nearest destinations
SELECT id, name FROM places WHERE scenario_id = $s ORDER BY geom <-> $pt LIMIT 5;
```

## Report rules (server)

1. Validate (`ReportInputSchema`), throttle (per IP and per device), snap within 30 m or 422. In live mode (scenario
   `simulated: false`) an app or web report that does not snap is saved to `offmap_reports` (migration 0008) and
   answered `off_map`; steps 2 onward do not run for it.
2. **Road clear:** open incidents (any type) with a report within 150 m are marked `conflicting`.
   If clear reports from two different devices now exist for one, it is resolved
   (`resolved_by_clear_reports`). A clear report counts for an incident when it was received at or
   after the incident's `created_at_s` and lies within 150 m of one of its supporting reports. The
   clear report is stored with `incident_id` = the first affected incident (by id); nothing nearby:
   `incident_id` null (`clear_noted`, no seq change). A second clear report from the same device
   within 150 m and 10 minutes updates the earlier one. The response's `incident` is the first
   affected incident; each affected incident gets its own seq and event.
3. **Duplicate:** the same device's earlier report on the incident being attached to, within 150 m
   and 10 simulated minutes, is updated in place (no new count; evidence still merges).
4. **Attach** to an open incident of the same type within 150 m, or **create** an Unverified one.
   If the nearest same-type incident is Resolved (no open one), create a new incident with
   `linked_incident_id` set; never reopen silently.
5. Merge evidence: deepest depth, heaviest congestion, highest severity, impassable if any report
   says so, `edge_ids` = union of extents, `note` = latest description.
6. **Corroborate:** two or more distinct devices within 150 m and 30 min → `corroborated`
   (shown as "Corroborated (2 devices)", never "confirmed"). Only an operator sets `verified`.
7. Source: `simulated` for scenario events, `user_report` otherwise; `verified_by` is
   `simulated_operator` for scripted verifications.

8. Scripted `verify | resolve | dismiss` events find their incident through the
   `incident_events.payload->>'eventId'` of `targetEventId` (also correct when that report was a
   duplicate). Events whose target is missing or closed are logged and skipped.

`incident_events.kind` is the report outcome (`created_incident`, `attached`, `corroborated`, …)
or `verified | resolved | dismissed`; `actor` is `device:<hash prefix>`, `operator` or
`simulated_operator`; `payload` holds `reportId`, `eventId`, `outcome`/`action`, `note`.
`sim_runs.status` is the run's last play state, or `ended` once a reset replaced it. The sim clock
(`sim_state`, `sim_time_s`, `next_event_index`) is persisted on every change and tick.

## Seed process

`pnpm --filter api db:migrate` then `pnpm --filter api db:seed`: reads
`packages/scenario-data` (graph.json, scenario.json), upserts `road_edges` for the graph version,
`places`, and the `scenarios` row. Re-running is idempotent. Reset (sim) deletes the scenario's
incidents, reports and events, bumps `seq`, sets `reset_seq = seq`, increments `reset_count`,
sets `run_id = <scenario>:run:<reset_count>`, and emits `sim.reset`.

## Scenario file format (`packages/scenario-data/andheri/scenario.json`)

`ScenarioSchema`: `id, name, area, simulated: true, timezone, clockStartsAt (ISO with offset),
simSecondsPerRealSecond, graphVersion, alerts[], hasAlertInformation, places[], demoTrip {profile,
originId, destinationId, alternativeDestinationIds, vehicleSpeedFactor, startTripAtS}, events[]`.
Events are ordered by `atS`: `report` events carry a `ReportInput` (with a simulated `deviceId`);
`verify | resolve | dismiss` events name a `targetEventId` (the event whose report created or
joined the incident). Incident ids for scripted reports are `<scenario>:inc:<eventId>`, report ids
`<scenario>:rep:<eventId>`, so a replay after reset produces identical ids.

Generated by `packages/scenario-data/scripts/build-fixture.ts`; never hand-edit the JSON.

## Live traffic incidents

Created only by `TrafficFeedService` in the live scenario: id `<scenario>:feed:tomtom:<sha1(externalId)[0:16]>`
(`:r<time>` suffix for a reappearance linked to a cleared one), `source = 'live_feed'`, `feed`
jsonb provenance, no `incident_reports` rows. Migration `0002_incident_feed.sql` adds the column.

## Report origin and audience incidents (migration 0003)

`incident_reports.origin` records where a report came from (contracts `ReportOrigin`). `incidents.audience_only` is
true while every supporting report has origin `audience`: a new incident takes it from its first report, and an
attached report from any other origin clears it. `POST /scenarios/:id/audience/clear` dismisses the open incidents with
`audience_only` set. Neither column is read by the routing engine: origin labels and limits, it is never evidence.

## offmap_reports (migration 0008)

Live-mode reports with no road edge within 30 m. Same fields as `incident_reports` minus the edge, distance and incident
link, plus the point (`geom`), `received_at_s` and the device's `client_report_id` (unique per scenario, so a relayed
repeat gets the original receipt). Kept apart so every `incident_reports` row still has a snapped edge. Nothing reads
these rows for routing, corroboration or incidents; they exist so an operator can see where reports come from outside
the map, and so they can be re-snapped if a graph is ever added for that area.

## report_photos

| Column | Notes |
| --- | --- |
| `report_id` text PK | `incident_reports.id`; one photo per report |
| `scenario_id` text | |
| `incident_id` text null | copied from the report at upload, so the console can list photos by incident |
| `content_type` text | `image/jpeg` |
| `bytes` bytea | the JPEG, at most 350 kB |
| `size_bytes` int | |
| `created_at` timestamptz | server time |

Index `(scenario_id, created_at)`. Migration `0005_report_photos`. Read only through the operator endpoints in CONTRACTS.md. There is no retention job yet (see docs/limitations.md): photos stay until the table is cleared.

## Lighting (P2-9)

`RoadEdge.lit` is optional: `true` or `false` from OpenStreetMap `lit=yes` or `lit=no`, and absent or null where the map does not say. The engine's walking graph carries it as `GEdge.lit` (null when unknown). It is read only when a walking plan is made with `preferLit: true`. Coverage in the Andheri extract: see docs/limitations.md.
