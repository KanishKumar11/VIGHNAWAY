# ROADMAP_STATUS.md

Last updated 2026-10-22. Details are in docs/TASKS.md; the plan is in docs/IMPLEMENTATION_PLAN.md.

> **▶ Continue from here:** P0-2.b, step 1 of "Paused work" below. Write `packages/engine/src/text/render.ts`. Then
> finish P0-2.b–d, and after that start P0-6a. Branch: `claude/new-session-m2rg0k`. Last commit: "P0-2 in progress…".

## Now

| | |
| --- | --- |
| **In progress** | P0-2 Localise the detailed engine sentences (paused mid-task, see below) |
| **Next** | P0-6a API Docker image, then P0-5a–c runbook, drill and recording, then P0-4p graph validation |
| **Gate in view** | G-P0 sandbox |

## Paused work: P0-2 (resume here)

**Done, not yet wired in:**
- `Text`/`TextSchema` added as optional companion fields in `packages/contracts/src/evaluation.ts`. CONTRACTS.md is
  not yet updated.
- Catalogs written:
  - `packages/engine/src/text/{en,hi,mr}.ts`, every engine sentence as a key;
  - `text/rules.ts`, Hindi and Marathi rule descriptions.
- `pnpm --filter @vighnaway/scenario-data hashes` prints the parity and replay plan hashes.

**Baseline before the refactor** (must be unchanged after it):

| Hash | Value |
| --- | --- |
| Parity (162 cases) | `1b6ed86885d3f0bd` |
| Replay plan, step 0 | `23f43274ce2ae103` |
| Replay plan, step 60 s | `1afd41030b43f502` |
| Replay plan, step 180 s | `080b7c3daff07586` |
| Replay plan, step 270 s | `bff5b0dc907c1c3f` |
| Replay plan, step 360 s | `697d7eed6f702f64` |
| Replay plan, step 370 s | `cfa44f990a4181aa` |
| Replay plan, step 480 s | `f5a43c279a25980c` |
| Replay plan, step 490 s | `1460c1b2e6d2460f` |
| Replay plan, end (1800 s) | `1460c1b2e6d2460f` |

**Checks run on the paused tree:** contracts and engine typecheck clean; contracts 11/11 and engine 48/48 pass.

**Next steps:**
1. Write `text/render.ts` (`renderText`, placeholders, modifiers `cap`, `lower` and `lowerall`).
2. Make `explain.ts`, `plan.ts` and `present.ts` build `Text` and render English from it.
3. Have `planHash` and the parity cases ignore `*Text` fields.
4. Add the tests from TASKS P0-2.b.
5. Wire the console (P0-2.c) and the phone (P0-2.d).
6. Then fix the `lowerall` copy bug, which lower-cases road names in "Route unchanged: …", as a separate commit that
   records the hash change.

## Completed

| Item | Evidence |
| --- | --- |
| P0-0.a Documentation sync | IMPLEMENTATION_PLAN §1. The `f8f85a4` tree (committed as "WIP, unverified") was verified afterwards: tsc, eslint, jest 77/77 and the Android export |
| P0-1.a Mobile design pass in the browser preview | docs/design/preview, 38 screenshots |

## Blockers

| Blocker | Items | What unblocks it |
| --- | --- | --- |
| No Android device or SDK in the build sandbox | P0-1c, P0-3, device halves of P1-4, P2-2 and P2-7 | A phone and a laptop with the Android SDK |
| No Google Maps key | P0-3a/b, real map in all screenshots | A browser key restricted by referrer; an Android key restricted by package and SHA-1 |
| Network policy rejects Overpass, TomTom and SACHET | P0-4a–d, P0-6b, P2-5c | Allow those hosts in the environment's network settings |
| People | P0-5d rehearsals, P3-2b native review | The team |
| Owner decision | P0-1d landscape Drive (native install); language scope (spec: Hindi + Punjabi; built: Hindi + Marathi) | Owner |

## Tests

Baseline run on 2026-10-22, `pnpm test`: **381 passing, 0 failing**.

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
| P0-2a–d structured engine text | in progress |
| P0-3 Android run | blocked |
| P0-4p graph validation | todo |
| P0-4a–d real graph | blocked |
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
- no device run;
- translations not reviewed by native speakers;
- device-id corroboration is a heuristic;
- shared operator token.
