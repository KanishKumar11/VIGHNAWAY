# Brief: API
Read in docs/BUILD_PROMPT.md: sections 1, 3 (environment variables; configuration, domains and preflight), 4 (contracts) and 5 (all). Also docs/CONTRACTS.md and docs/DATA_MODEL.md.
Scope: apps/api, packages/contracts, infra/docker-compose.yml.

Deliver, in order:
1. Docker compose with postgis/postgis; Drizzle schema and migrations (postgis extension first, GiST indexes); seed from scenario-data.
2. Contracts: Zod schemas for every payload and socket event (incident.upserted, sim.state, sim.tick, sim.reset, trip.position).
3. Endpoints: health; scenario; incidents since seq; reports (validate, throttle, snap within 30 m, corroborate within 150 m and 30 simulated minutes, one transaction, emit after commit); operator verify, resolve and dismiss behind OPERATOR_TOKEN; the Report semantics rules in section 5 (duplicates, late reports, Road clear conflicts, server-assigned time).
4. socket.io /live gateway: one room per scenario; trip.position relayed from memory only.
5. Hygiene: helmet, CORS allowlist, request size limits, structured logs.

Acceptance: Jest with supertest against a test database covers report, corroboration, same-device rejection, verify, reset and the matching socket events; all pass.
Do not: send routes from the server, or add any state that affects routing other than incidents.
