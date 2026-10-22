# VIGHNAWAY API (`apps/api`)

NestJS 11 + Drizzle (postgres.js) + PostGIS + socket.io. Owns incident persistence, report
validation, snapping, corroboration, operator actions, the scripted simulation and live sync.
It never computes or returns routes (`@vighnaway/engine` is a dev dependency used only by tests).

Contracts: `docs/CONTRACTS.md` (REST, errors, socket events). Schema and report rules:
`docs/DATA_MODEL.md`. Environment variables: `.env.example`.

## Run locally

```sh
docker compose -f infra/docker-compose.yml up -d db   # or any Postgres 16 + PostGIS 3.4
pnpm --filter api db:migrate                          # drizzle/ (0000 creates the postgis extension)
pnpm --filter api db:seed                             # idempotent: road_edges, places, scenarios
OPERATOR_TOKEN=... pnpm --filter api dev              # tsx watch, http://localhost:4000
curl localhost:4000/health
```

Build and start: `pnpm --filter api build && pnpm --filter api start` (CommonJS in `dist/`,
using the workspace packages' built `dist/*.cjs`, so build `packages/*` first:
`npx turbo run build --filter='./packages/*'`). The full stack in Docker:
`OPERATOR_TOKEN=... docker compose -f infra/docker-compose.yml up -d` (the API container runs
migrate, seed, then the server on every start).

## Accounts (email one-time code)

Set `ADMIN_EMAILS=you@example.com` and start the API. Signing in on the console with that email makes you an admin; the
admin page adds operators by email. Without `SMTP_URL` the 6-digit code is written to the API log (development only; with
`NODE_ENV=production` sign-in emails are refused). For real email set `SMTP_URL` (for example a Gmail app password:
`smtps://you%40gmail.com:app-password@smtp.gmail.com:465`) and `MAIL_FROM`. Roles, who may sign in where, limits and the
endpoints are in docs/CONTRACTS.md "Accounts". `OPERATOR_TOKEN` keeps working for the scripted demo.

## Tests

`pnpm --filter api test:unit` runs the account tests that need no database (in-memory repository, fake clock and mailer).

`pnpm --filter api test` runs Vitest + supertest + socket.io-client against
`postgres://vighnaway:vighnaway@127.0.0.1:5432/vighnaway_test` (override with
`TEST_DATABASE_URL`; the database name must end in `_test`). Global setup drops the API's tables,
migrates from scratch and seeds twice. Files run serially because they share the database.

`test/scenario.e2e.test.ts` steps the scripted scenario through `POST /sim/step`, plans with the
engine on the API's incident snapshot exactly like `packages/scenario-data/scripts/replay.ts`, and
asserts the same recommendations, the same incidents and byte-identical `planHash`es as the offline
replay, then again after a reset.

## Notes

- Decorators: every constructor parameter uses an explicit `@Inject(token)`, so the code runs
  under tsx/esbuild (no decorator metadata) as well as tsc and SWC (tests).
- One API process per database: the simulation clock, its timer and the latest `trip.position`
  live in memory. On start, a clock persisted as `playing` comes back `paused` (or `finished`).
- Logs are pino JSON (`LOG_LEVEL`); request bodies and the Authorization header are never logged.
