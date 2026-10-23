# Vighnaway

*Vighna* (विघ्न) means obstacle. Vighnaway is our hackathon take on navigation during a flood.

Every monsoon the Andheri Subway in Mumbai fills with water, and map apps keep sending cars into it
because on paper it is still the quickest way across the railway. People standing next to it know
it's flooded. A control room might know. The app you're following usually doesn't.

Vighnaway routes on that kind of evidence. One unconfirmed report slows a road down in the ranking
but doesn't close it. Two phones reporting the same spot, or an operator confirming it, does. Every
time the route changes, the app tells you why in one line: what was reported, by whom (roughly),
how long ago, and how sure we are. And if a flood-prone road has had no reports at all during a
rain alert, we don't take that as good news.

The roads are real (an OpenStreetMap extract of Andheri). The floods, jams and closures in the demo
are simulated, and the app labels them that way on every screen.

## What's in here

| Part | Folder | Built with |
| --- | --- | --- |
| Phone app | `apps/mobile` | Expo SDK 58 dev build, Google Maps |
| Control room (plus `/report`, `/verify`, `/rules`, `/debug`) | `apps/console` | Next.js 15, Tailwind 4 |
| API | `apps/api` | NestJS 11, Drizzle, Postgres 16 + PostGIS, socket.io |
| Route engine | `packages/engine` | Plain TypeScript, no dependencies on a hosted router |
| Shared types | `packages/contracts` | Zod |
| Colours, type, spacing | `packages/tokens` | |
| Andheri graph and the demo scenario | `packages/scenario-data` | |

The server never sends anyone a route. It stores and broadcasts reports, and the phone and the
control room each run the same engine on them. Same reports in, same route out, which is how you can
check one against the other (there's a parity hash on both debug screens) or re-run an old decision
from its receipt on `/verify`. No LLM or randomness is involved in picking a route.

A few other things we got working along the way: a step-free walking profile, an opt-in "prefer
well-lit roads" preference, spreading trips across nearby hospitals, sending a report by QR code
when you have no signal, Hindi and Marathi, and a second map with real roads from Amritsar to
Ambala.

## Running it

You need Node 22, pnpm 10 and Postgres 16 with PostGIS (Docker is fine). The phone app needs the
Android SDK, and it runs as a custom dev build; Expo Go won't work.

```sh
pnpm install
pnpm build
docker compose -f infra/docker-compose.yml up -d db     # or your own Postgres with PostGIS
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm preflight                                           # checks env, database, CORS and keys
```

Copy `.env.example` (and the one in each app) and fill it in first. Then, in separate terminals:

```sh
pnpm --filter api dev          # http://localhost:4000
pnpm --filter console dev      # http://localhost:3000/console
pnpm --filter mobile android   # builds and installs the dev client
pnpm --filter mobile start     # Metro
```

Or the whole thing in Docker: `OPERATOR_TOKEN=... docker compose -f infra/docker-compose.yml up -d`.

To run the demo, open the control room, enter the operator token, press Reset, then Play. Start a
trip on the phone at the same time. `pnpm --filter @vighnaway/scenario-data tune` replays the same
scenario offline and prints every decision, which is handy for checking nothing changed.

## Tests

```sh
pnpm test         # the API suite needs a Postgres test database (TEST_DATABASE_URL ending in _test)
pnpm typecheck
pnpm lint
pnpm --filter @vighnaway/engine bench
```

`pnpm smoke` drills the scripted demo against a running API. It resets the scenario, so don't run it
in the middle of a demo.

## Environment variables

Nothing is hard-coded to our domain, so it all runs locally. The full commented list is in
`.env.example`; these are the ones you'll actually touch:

| Variable | Where | What for |
| --- | --- | --- |
| `DATABASE_URL` | API | Postgres |
| `OPERATOR_TOKEN` | API | Operator and simulation actions. Keep it server-side |
| `CORS_ORIGINS` | API | Which console origins may connect |
| `DEVICE_HASH_SALT` | API | Hashing device ids |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_REPORT_URL` | Console | API address, a referrer-restricted maps key, the QR link |
| `EXPO_PUBLIC_API_URL` | Phone | Default API address (can be changed in Settings) |
| `GOOGLE_MAPS_ANDROID_KEY` | Phone build | Maps key restricted to the package and SHA-1 |
| `USE_CLEARTEXT` | Phone build | Set to `1` if the API is plain HTTP on your LAN |

## Honest limits

- Two devices agreeing is a heuristic, not proof. One person with two phones can do it. That's why
  "Corroborated" and "Verified" are separate, and only an operator can set Verified.
- OpenStreetMap doesn't mark the Andheri Subway as flood-prone, so we set that by hand. A real
  deployment would use the city's own list.
- Speeds are typical monsoon values per road type, not live traffic. The TomTom adapter is written
  but hasn't been tested against the real service.
- The phone app has only had a partial run on a real device so far. Route-planning speed on a phone
  isn't measured yet.
- The Hindi and Marathi text still needs a native speaker to go over it.

Road data © OpenStreetMap contributors. Map tiles © Google. Check both providers' terms before
putting OSM-based routes on Google Maps anywhere public.
