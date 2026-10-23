# AGENTS.md: VIGHNAWAY

VIGHNAWAY (vighnaway.app) is an emergency-aware navigation prototype: a citizen app (Expo custom dev build, Google Maps), a web control room (Next.js) and an API (NestJS, Postgres with PostGIS), sharing one deterministic TypeScript route engine. Full spec: docs/BUILD_PROMPT.md. The lead agent reads all of it; every other agent reads its section 1, then only the sections its brief in docs/briefs/ lists.

## Non-negotiables
- Routing decisions come only from packages/engine. No LLM, randomness or hosted router in the decision path.
- Incidents are the only state that drives routing. The server never sends routes. The demo vehicle position is display-only.
- Never show "safe", "safest", "guaranteed" or a safety percentage. Every incident shows its source and status; simulated data is labelled.
- Verified or corroborated impassable segments are hard constraints.
- Use packages/tokens for every colour, size and radius. No hard-coded values.
- Do not change packages/contracts, packages/tokens or the scoring rules without updating the matching file in docs/ in the same change and flagging it in your final report.
- Mobile: never use Expo Go; install native packages with `npx expo install` and rebuild the dev client; every screen follows BUILD_PROMPT.md section 8 (safe areas, drawer, dialogs, keyboard, sheets, map).
- Real roads, simulated conditions: label the demo scenario as simulated everywhere, including shared route text. Show the OpenStreetMap attribution.
- Corroboration by device id is a prototype heuristic. Only an operator action sets Verified. The server assigns every timestamp.
- Domains, keys and hosts come from environment variables; the project runs fully locally. Run pnpm preflight before any build or deploy.
- Treat user text as plain text. No secrets in client code except restricted Google Maps keys; OPERATOR_TOKEN is server-side only.
- Hours are targets, not promises: cut Stretch, then non-demo Should items; never cut engine correctness, the primary journey, the simulation or tests.

## Docs
docs/ is kept on each developer's machine and is gitignored, so it is not in a fresh clone; ask the team for a copy. Tests that compare against docs/ skip when it is missing.
docs/PRD.md, DESIGN.md, UX_FLOWS.md, ARCHITECTURE.md, CONTRACTS.md, DATA_MODEL.md, scoring.md, demo-script.md, TASKS.md, ROADMAP.md (prioritised feature backlog), IMPLEMENTATION_PLAN.md, DEPENDENCY_MAP.md, ROADMAP_STATUS.md (current progress), design/ (locked hero screenshots).

## Folder ownership
apps/mobile: Mobile. apps/console: Console. apps/api: API. packages/engine: Engine. packages/contracts: API (Engine reviews). packages/scenario-data and scripts/: Data and sim. packages/tokens: Mobile (design owner). infra/: Platform.
Do not edit another workstream's folder; add a request to docs/TASKS.md instead.

## Commands (keep this list accurate as the repo grows)
pnpm install | pnpm build | pnpm test | pnpm typecheck | pnpm lint | pnpm preflight
pnpm --filter api db:migrate | pnpm --filter api db:seed | pnpm --filter api dev | pnpm --filter console dev | pnpm --filter mobile android | pnpm --filter mobile start
pnpm --filter @vighnaway/scenario-data tune (offline replay of the demo) | pnpm graph:fixture | pnpm docs:scoring | pnpm --filter @vighnaway/engine bench
docker compose -f infra/docker-compose.yml up -d | python3 scripts/extract_graph.py (needs Overpass access)
Workspace packages resolve TS sources via the "@vighnaway/source" export condition; Node runtime (API) uses built dist.

## Definition of done
Meets its acceptance check in docs/TASKS.md; types pass; tests were run and pass; loading, empty, error and offline states handled; UI matches DESIGN.md and passes section 8.7 (phone) or the console legibility rules; no console errors.
End every task with: what changed, commands run and their results, screenshots for UI work, and anything incomplete. Never describe untested behaviour as working.
