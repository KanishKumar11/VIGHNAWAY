# TASKS.md: work breakdown

Owner: Platform. Every Must item, with owner, dependencies, acceptance check and gate. Status is
updated in the same change as the work. Status values: **done** (acceptance check run and
passing, evidence noted), **partial** (built, acceptance not fully run), **blocked** (needs
hardware, credentials or network not available to the build environment), **todo**.

Gates: G1 foundations (h0–2), G2 core (h2–8), G3 integrate (h8–14), G4 complete (h14–18), G5
release.

| ID | Task | Owner | Depends | Acceptance check | Gate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Planning docs (PRD, DESIGN, UX_FLOWS, ARCHITECTURE, CONTRACTS, DATA_MODEL, scoring, demo-script, TASKS, AGENTS) | Platform / all | — | All files exist and agree with code | G1 | done |
| T02 | Monorepo: pnpm, Turborepo, strict TS, Prettier/ESLint | Platform | — | `pnpm install && pnpm build && pnpm test` | G1 | done (20/20 turbo tasks; lint clean) |
| T03 | Docker compose: PostGIS + API with health checks | API | T02 | `docker compose -f infra/docker-compose.yml up -d` → `/health` ok | G1 | partial (compose validates, PostGIS container healthy; API image build not completed: proxy CA in sandbox) |
| T04 | Graph extract (`scripts/extract_graph.py`) | Data | — | Runs against Overpass; checks pass; overlay reviewed at the 3 crossings | G1 | **blocked** (Overpass unreachable from build sandbox); conversion unit-tested offline; schematic fixture committed instead |
| T05 | Contracts frozen | API + Engine | T02 | Package compiles; CONTRACTS.md matches | G1 | done |
| T06 | Expo dev build with styled Google map on a real Android phone | Mobile | T02 | Map renders on device | G1 | **blocked** (no Android SDK or device in build sandbox) |
| T07 | Engine: loadGraph, snap, dijkstra, yen, evaluate, rank, explain, planTrip, replanFrom, reachable, SCORING_RULES, parity hash | Engine | T05 | Vitest suite (section 4 + boundary tests) green; planTrip < 200 ms on phone | G2 | done in Node (48 tests); phone timing **todo** |
| T08 | API: reports, snapping, corroboration, operator actions, gateway, seq resync | API | T03, T05 | Jest/Vitest + supertest suite green against a test DB | G2 | done (34 tests on PostGIS 3.4) |
| T09 | App shell: providers, drawer, sheet, safe areas (section 8) | Mobile | T06 | Section 8.7 checklist on two phones | G2 | partial (code + unit tests; device checklist **blocked**) |
| T10 | Three hero screens static, locked after phone review, screenshots in docs/design | Mobile | T09 | Team review on a phone | G2 | partial (built; phone review **blocked**) |
| T11 | Console map + incident queue | Console | T05 | Renders at 1920×1080 | G2 | done (Playwright screenshots in apps/console/screenshots; Google map path untested, schematic fallback tested) |
| T12 | Simulation runner (play, pause, step, reset, tick) | Data + API | T08 | Reset + replay twice → identical logs and engine outputs; script ≈ 90 s | G3 | done (API e2e test: identical snapshots and plan hashes; 7 events in ~50 s real time, trip ends ~90 s) |
| T13 | Engine on phone and console; parity hash matches | Mobile + Console | T07 | Same hash on /debug and the phone debug screen | G3 | partial (same function; phone run **blocked**) |
| T14 | Report flow end to end (phone modal, /report page, API) | Mobile + Console + API | T08 | Report from a phone appears on the console within 2 s | G3 | partial (API → console verified in Playwright, Verify visible in 26 ms; phone path tested only in Jest) |
| T15 | Banners, haptics, local notifications | Mobile | T13 | Seen on device, notification when backgrounded | G3 | partial (device **blocked**) |
| T16 | En-route mode: vehicle, travelled tint, replanFrom, trip.position relay | Mobile + API + Console | T12, T13 | Console shows the phone's vehicle; re-plans never reverse unless forced | G3 | partial (engine tests; relay tested in API and console against a mock phone; no real phone) |
| T17 | Edge states (loading, empty, error, offline, stale, no viable route) | Mobile + Console | T13 | Every UX_FLOWS state reachable | G4 | partial (console states exercised in Playwright; mobile states in Jest only) |
| T18 | Dependency-failure tests: invalid Maps key, API stopped, network off | QA | T17 | Each shows its fallback and routing keeps working | G4 | partial (console: API stopped and no Maps key verified; mobile untested on device) |
| T19 | Tests: engine, API, mobile RNTL, Maestro flow | All | — | All suites green; Maestro on device | G4 | done for automated suites (381 tests on 2026-10-22); Maestro **blocked** |
| T20 | Release APK on two phones, release SHA-1 on the Google key, backup video | Mobile + QA | T06 | APK runs without Metro | G5 | **blocked** |
| T21 | `pnpm preflight` | Platform | — | Lists missing env, checks DB/PostGIS, API health, CORS, SHA-1, token leaks | G1 | done |
| T22 | Rehearsals: three timed runs under 3 minutes | Pitch + QA | all | Logged in demo-script.md | G5 | todo |

## Should

| ID | Task | Status |
| --- | --- | --- |
| S1 | Vehicle profiles (on foot, two-wheeler, car) | engine done and tested; mobile profile chips built (Jest only) |
| S2 | Reachable destination | done in engine, console and mobile (Jest); device untested |
| S3 | SMS share | built (expo-sms or Share sheet, Simulated label tested); device untested |
| S4 | Offline mode | built (MMKV, NetInfo, pending reports); device untested |

## Requests between workstreams

(Add requests here instead of editing another workstream's folder.)

- Mobile → tokens: `layout.sheetSnapPeek` raised from 190 to 280 (peek content did not fit); the app still grows the peek from measured content at large font sizes. **Done.**
- API → contracts (optional): add `JoinAckSchema` / trip-position ack schema so clients can validate socket acks. **Open.**
- Console → tokens (optional): export a ready-made CSS-variable string instead of duplicating `gen-css.ts` naming. **Open.**
- Data → team: run `scripts/extract_graph.py` with network access, review `graph.overlay.html` at the three crossings, fill `flood-prone.json` `osmWayIds`, then re-tune `scenario.json` (`pnpm --filter @vighnaway/scenario-data tune`). **Open, blocks a real-map demo.**

---

# Roadmap tasks (docs/ROADMAP.md)

> **▶ Continue from here:** **P0-2.b**, in progress. The resume steps and the hash baseline are in
> docs/ROADMAP_STATUS.md under "Paused work".

Every unfinished roadmap item, split into small tasks that can each be verified on their own. The roadmap IDs
(P0-1 … P3-7) are stable. A task ID is the roadmap ID plus a letter. The order and the reasons for it are in
docs/IMPLEMENTATION_PLAN.md, and the dependencies are in docs/DEPENDENCY_MAP.md.

**Status values:**
- **done:** acceptance check run and passing; the evidence is linked.
- **in progress**
- **todo**
- **blocked:** the blocker is named.
- **needs decision:** waiting for the owner.
- **deferred**

**Effort:** focused hours for one agent, as a range.

## P0-0 Documentation sync (pre-work)

### P0-0.a Fix audited documentation defects
Priority P0 · Status **done** · Effort 0.5 h · Depends —
- **Files:** docs/UX_FLOWS.md §7, docs/TASKS.md T07/T19, docs/limitations.md
- **Behaviour:** The docs describe what the build actually has: Hindi and Marathi shipped, Punjabi in the spec but not built,
  and today's test counts.
- **Steps:**
  1. Correct the language line in UX_FLOWS §7.
  2. Correct the test counts.
  3. Record the language-scope note.
- **Automated tests:** none (docs only). **Manual tests:** read-through.
- **Docs:** this task.
- **Acceptance:** No audited defect remains; every number matches the baseline run log.
- **Evidence:** baseline run of 2026-10-22: 381 tests, typecheck and lint clean (IMPLEMENTATION_PLAN §1).

## P0-1 Finish and lock the mobile design pass

### P0-1.a Browser-preview build and hero review, both themes
Priority P0 · Status **done** · Effort — · Depends —
- **Evidence:**
  - docs/design/preview (38 PNGs);
  - `npx tsc --noEmit -p .` clean, `npx eslint app src test` clean, `npx jest --ci` 77/77, Android export bundled 2,512
    modules (2026-10-22);
  - hero screens reviewed by the lead in light and dark.

### P0-1.b Recapture the offline and loading states
Priority P0 · Status todo · Effort 0.5 h · Depends P0-1.a
- **Files:** apps/mobile Debug fixtures, docs/design/preview
- **Behaviour:**
  - The offline bar reads "Offline: using incidents from {clock} ({age} old)".
  - The loading skeleton is static and does not shimmer.
- **Automated tests:** the existing jest suites for the offline bar and the skeleton.
- **Manual tests:** a preview capture of both states in light and dark.
- **Docs:** docs/design/README.md
- **Acceptance:** Four new screenshots that match DESIGN_VISION §13 (no motion, status not shown by colour alone).

### P0-1.c Device design review (§8.7 checklist, TalkBack, rendered contrast)
Priority P0 · Status **blocked**: no Android device or SDK · Effort 2 h with a phone · Depends P0-3.a
- **Device tests:**
  - safe areas, the soft keyboard, system font at 200%;
  - TalkBack order and labels;
  - haptics;
  - Hindi and Marathi voices;
  - gesture and three-button navigation;
  - 60 fps route change.
- **Acceptance:** The checklist is recorded in docs/design/README.md with the device model and the Android version.

### P0-1.d Landscape Drive mode
Priority P0 · Status **needs decision** · Effort 1 h + dev-client rebuild · Depends owner
- **Options:**
  1. Unlock orientation app-wide. Risky.
  2. `npx expo install expo-screen-orientation` and unlock only on `/drive`. Recommended.
- **Until decided:** Drive mode is documented as portrait-only.

## P0-2 Localise the detailed engine sentences (decision D1)

### P0-2.a Contracts: structured text type
Priority P0 · Status in progress (schema added; CONTRACTS.md pending) · Effort 1 h · Depends P0-0
- **Files:** packages/contracts/src/evaluation.ts, docs/CONTRACTS.md
- **Behaviour:**
  - `TextSchema = { key: string, params: Record<string, string | number | Text> }`.
  - New optional `text` companions:
    - `Explanation` gets `reasonText`, `tradeOffText`, `recheckIfText` and `confidenceReasonTexts`;
    - `RouteChange` gets `messageText` and `tradeOffText`;
    - `PlanNotice` gets `text`.
  - The English fields stay unchanged.
- **Automated tests:** contracts schema round-trip.
- **Acceptance:** Both clients typecheck unchanged; CONTRACTS.md documents the fields.

### P0-2.b Engine: one catalog, structured output, English unchanged
Priority P0 · Status in progress (catalogs written; renderer and wiring pending, see ROADMAP_STATUS) · Effort 3–4 h · Depends P0-2.a
- **Files:**
  - packages/engine/src/text/{catalog.en,catalog.hi,catalog.mr,render}.ts
  - packages/engine/src/explain.ts, plan.ts, present.ts, rules.ts
- **Behaviour:**
  - Every sentence the engine builds comes from a catalog key.
  - `renderText(text, 'en')` produces exactly today's English string.
  - Rule descriptions in `SCORING_RULES` get keys.
- **Automated tests:**
  - every key exists in en, hi and mr;
  - every placeholder is filled in all three languages;
  - `findForbiddenWords` passes on every rendered string (hi and mr: no सुरक्षित except in the allowed reversal sentence,
    no %, no guarantee wording);
  - English output identical for all parity cases;
  - `parityHash` unchanged.
- **Docs:** docs/scoring.md (regenerated), docs/limitations.md.
- **Acceptance:** All engine tests pass; the parity hash equals the pre-change value; the API e2e and the offline replay
  plan hashes are unchanged.

### P0-2.c Console renders engine text through the catalog
Priority P0 · Status todo · Effort 1–2 h · Depends P0-2.b
- **Files:** apps/console/src/components/console/DemoTripPanel.tsx, RulesContent.tsx, Timeline, i18n
- **Automated tests:** vitest renders the decision panel in hi and mr with no English engine sentence left; a snapshot of
  the key path.
- **Manual tests:** Playwright screenshots, Hindi route-change settled, light and dark.
- **Acceptance:** In Hindi and Marathi the reason, trade-off, re-check and confidence reasons, and the rules page, are
  shown in that language.

### P0-2.d Phone renders engine text through the catalog
Priority P0 · Status todo · Effort 1–2 h · Depends P0-2.b
- **Files:** apps/mobile/src/i18n/engineText.ts (simplify to `renderText`), WhyCard, How it decides
- **Automated tests:** jest in hi and mr for WhyCard, the banner label and How it decides.
- **Manual tests:** preview screenshots `13-navigate-hindi`, plus a Why card in Marathi.
- **Device tests:** Hindi and Marathi TTS (blocked, P0-3).
- **Acceptance:** As for P0-2.c, on the phone; `engineText.ts` no longer re-composes sentences by hand.

## P0-3 Real Android run (blocked: no device, SDK or Google key in the sandbox)

| Task | What | Acceptance | Status |
| --- | --- | --- | --- |
| P0-3.a | Build the dev client (`pnpm --filter mobile android`) with `GOOGLE_MAPS_ANDROID_KEY` | Styled Google map renders on a phone | blocked |
| P0-3.b | Key restriction: package `app.vighnaway` and SHA-1 from `pnpm preflight` | A wrong SHA-1 shows the grey map; the right one shows the map | blocked |
| P0-3.c | §8.7 interaction checklist on two phones | Checklist recorded with models | blocked |
| P0-3.d | Parity hash on the phone's Debug screen equals the console `/debug` | Same hash string | blocked |
| P0-3.e | Notifications and haptics while the app is in the background | Notification seen on a route change | blocked |
| P0-3.f | Release APK with the release SHA-1 on the key; runs without Metro | APK installed on two phones | blocked |

All six are 3–4 h in total with a phone. Record only the checks that were actually done; an emulator does not count as a
real device.

## P0-4 Real road graph (blocked: Overpass rejected by the network policy)

### P0-4p Graph validation script (runs on the fixture now)
Priority P0 · Status todo · Effort 1.5 h · Depends —
- **Files:** packages/scenario-data/scripts/validate-graph.ts (Data owner)
- **Behaviour:** Reports on any `graph.json`:
  - connected components;
  - one-way edges without a twin;
  - origin and destination reachability for each profile;
  - the three crossings present, with their kind;
  - flood-prone edges listed with their source (OSM way id or hand-set).
- **Automated tests:** a vitest that runs it on the fixture and expects no errors.
- **Acceptance:** Exit 0 on the fixture with a printed report; the same command runs after P0-4a.

| Task | What | Status |
| --- | --- | --- |
| P0-4.a | Run `python3 scripts/extract_graph.py` with Overpass access | blocked (network) |
| P0-4.b | Review `graph.overlay.html` at the three crossings; check one-ways, bridges, tunnels and access tags | blocked (P0-4.a) |
| P0-4.c | Fill `flood-prone.json` `osmWayIds` from documented sources; mark the assumptions | blocked |
| P0-4.d | Re-tune `scenario.json` (`pnpm --filter @vighnaway/scenario-data tune`); regenerate the seeds; record the new route order | blocked |

## P0-5 Rehearsals and fallback

### P0-5.a Demo runbook: reset, recovery paths
Priority P0 · Status todo · Effort 1 h · Depends —
- **Files:** docs/demo-script.md (Pitch owner)
- **Behaviour:** Exact steps to:
  - reset between runs (sim reset; clear audience reports once P1-3 exists);
  - recover from API down, map key failure, Wi-Fi loss and phone failure. Each has the fallback screen it shows, and the
    fallbacks are already tested (T18).
- **Acceptance:** Every recovery path names a command or click and the expected screen.

### P0-5.b Recovery drill in the sandbox
Priority P0 · Status todo · Effort 1 h · Depends P0-5.a
- **Steps:**
  1. Stop the API mid-run.
  2. Restart it.
  3. Confirm the console resyncs by seq.
  4. Run without the Maps key.
- **Automated tests:** the existing console Playwright checks.
- **Acceptance:** A drill log in docs/demo-script.md with timestamps.

### P0-5.c Recorded fallback of the working console demo
Priority P0 · Status todo · Effort 1 h · Depends P0-5.a
- **Behaviour:** A Playwright video of the 7-step scripted demo driven against the real API, in light and in the
  presenter view. Stored under `docs/demo/` (or attached to the release if it is too large for git).
- **Acceptance:** The video plays end to end and shows the Simulated label throughout. The phone part is blocked
  (P0-3).

### P0-5.d Three timed rehearsals
Priority P0 · Status **blocked**: needs the team · Effort 1.5 h
- **Acceptance:** Three runs under 3 minutes, logged with times.

## P0-6 API container and live data

### P0-6.a API Docker image builds and starts
Priority P0 · Status todo · Effort 1–2 h · Depends —
- **Files:** apps/api/Dockerfile, infra/docker-compose.yml
- **Behaviour:** `docker compose -f infra/docker-compose.yml up -d --build` starts PostGIS and the API. Migrations and the
  seed run, and `/health` returns ok with the graph version. The proxy CA is supplied at build time only as a build
  secret, never baked into the image.
- **Acceptance:** `curl /health` returns `ok: true` from the container; the image contains no CA or secret (checked with
  `docker history` and a file listing).

### P0-6.b TomTom against the real service
Priority P0 (optional) · Status **blocked**: key and network · Effort 1 h
- **Acceptance:** One live poll creates labelled incidents. Any differences from the recorded fixture are noted in
  docs/live-traffic.md.

## P1-1 "Why not that route?" counterfactuals (decision D3)

### P1-1.a Engine: counterfactual per shown route
Priority P1 · Status todo · Effort 3 h · Depends P0-2.b
- **Files:** packages/engine/src/counterfactual.ts, plan.ts, rank.ts; packages/contracts/src/evaluation.ts
- **Behaviour:** For every non-recommended route, `counterfactual` is one of:
  - **`blocked`:** lists each hard block. A faster ETA can never make it recommended while any block stands. If clearing
    those blocks would make it recommended, it says so; that claim is checked by re-ranking with those incidents removed.
  - **`hazards`:** the smallest set of its active hazards (tried one at a time, then all together, in id order) whose
    removal makes it recommended, checked by re-ranking. Otherwise `none_sufficient`.
  - **`time`:** how many seconds of ranking cost it would need to lose to pass the switching rule, computed from
    `switchThresholdS`.
  - "Smallest" is claimed only for single-hazard sets. Otherwise the text says "if these were cleared".
- **Automated tests:**
  - one test each for blocked, hazard-penalised and slower-only;
  - one test with two hazards;
  - a property test: for each case, applying the stated change in a re-run of `planTrip` really makes the route
    recommended;
  - a parity case added.
- **Docs:** CONTRACTS.md, scoring.md ("How counterfactuals are computed").
- **Acceptance:** All tests pass; planTrip on the 3,900-node bench is still under 100 ms in Node.

### P1-1.b Console: "Why not this route?" in the decision panel and on map hover
Priority P1 · Status todo · Effort 2 h · Depends P1-1.a
- **Automated tests:** vitest for each counterfactual kind.
- **Manual tests:** Playwright screenshots of the route comparison, light and dark, and in Hindi.
- **Acceptance:** Each alternative shows its counterfactual sentence. A blocked route never shows "would be faster" as a
  reason to take it.

### P1-1.c Phone: counterfactual line in the route comparison
Priority P1 · Status todo · Effort 1.5 h · Depends P1-1.a
- **Automated tests:** jest. **Manual tests:** preview `05-navigate-half` recaptured.
- **Acceptance:** As for P1-1.b.

## P1-3 Judge-in-the-loop demo (decision D4)

### P1-3.a API: audience origin tag and operator bulk clear
Priority P1 · Status todo · Effort 2 h · Depends —
- **Files:**
  - packages/contracts (`ReportInput.origin?: 'app' | 'web' | 'audience'`; `API_PATHS.clearAudience`);
  - apps/api reports and incidents;
  - a migration if a column is needed.
- **Behaviour:**
  - Audience reports go through `ReportsService` unchanged: snapping, corroboration, the throttle and seq.
  - `POST /scenarios/:id/audience/clear` (operator token) dismisses every open incident whose reports are all
    audience-origin. It logs one `incident_events` row per incident and broadcasts.
- **Automated tests:**
  - no token returns 401;
  - clear leaves scripted and mixed-origin incidents alone;
  - the seq advances;
  - the socket broadcasts.
- **Docs:** CONTRACTS.md, DATA_MODEL.md.
- **Acceptance:** Supertest suite green.

### P1-3.b Report page: audience mode via the QR link
Priority P1 · Status todo · Effort 1 h · Depends P1-3.a
- **Behaviour:** `/report?audience=1` sends `origin: 'audience'` and shows "Demo audience report: simulated scenario".
- **Automated tests:** vitest. **Acceptance:** The origin is stored, and visible in the console queue as a chip.

### P1-3.c Console presenter panel: QR, live status ladder
Priority P1 · Status todo · Effort 2–3 h · Depends P1-3.b
- **Behaviour:**
  - Presenter mode shows a large QR code.
  - It shows a live ladder for the newest audience incident: Unverified, then Corroborated (2 devices), then Verified
    (operator). Each step is named with what it means: corroboration is a device heuristic; only the operator verifies.
  - "Clear audience reports" asks for confirmation in the dialog.
- **Automated tests:** vitest for the ladder states.
- **Manual tests:** screenshots, light and dark.
- **Acceptance:** The ladder updates from socket events without a reload.

### P1-3.d End-to-end: two browsers report, route changes
Priority P1 · Status todo · Effort 1.5 h · Depends P1-3.c
- **Behaviour:** Playwright:
  1. Two phone-sized contexts with different device ids report a knee-deep flood at the same point on the demo route.
  2. The console shows Corroborated.
  3. The demo trip's route changes.
  4. The operator verifies.
  5. Clear removes it.
- **Acceptance:** The script passes against the real API, with screenshots saved.

## F-COV Evidence coverage input (decision D2; shared by P1-5 and P1-4)

### F-COV.a API publishes observations per edge
Priority P1 · Status todo · Effort 2 h · Depends —
- **Behaviour:**
  - The incidents payload gains `observations: { edgeId, lastObservedAtS, kind: 'hazard' | 'clear' }[]` for flood-prone
    edges.
  - Road clear reports count; an incident report counts as `hazard`.
  - The payload is versioned by seq and replayable from `/history`.
- **Automated tests:**
  - a clear report updates the observation and does not change any incident status;
  - history at a seq returns the observations as of that seq.
- **Docs:** CONTRACTS.md, DATA_MODEL.md.

### F-COV.b Engine uses observations for the data-gap rule
Priority P1 · Status todo · Effort 1.5 h · Depends F-COV.a
- **Behaviour:** An edge is covered when any observation (hazard or clear) is within `dataGap.windowS`. A clear
  observation never removes a hazard penalty or a block.
- **Automated tests:**
  - boundaries at exactly 60 min and at 60 min + 1 s;
  - a clear plus an open incident keeps the incident's effect;
  - parity case;
  - a before/after replay of the demo, with differences recorded.
- **Docs:** scoring.md (rule text change, flagged), limitations.md.
- **Acceptance:** Demo steps unchanged, or re-tuned with the change logged.

## P1-5 Evidence coverage map

### P1-5.a Engine: `evidenceCoverage(graph, observations, nowS)`
Priority P1 · Status todo · Effort 1.5 h · Depends F-COV.b
- **Behaviour:** For each flood-prone road (edges grouped by name), the class is:

  | Class | Latest observation |
  | --- | --- |
  | `fresh` | 30 min old or newer |
  | `ageing` | between 30 min and 3 h |
  | `stale` | older than 3 h |
  | `none` | no observation |

  These boundaries are the existing age-factor thresholds from SCORING_RULES. Each road also gets `lastObservedAtS` and
  a structured summary text.
- **Automated tests:** boundaries at 30 min, 30 min + 1 s, 3 h and 3 h + 1 s; `none`; mixed edges on one road (the
  newest edge wins, and the oldest edge is reported as well).

### P1-5.b Console layer, legend, situation-brief line
Priority P1 · Status todo · Effort 2–3 h · Depends P1-5.a
- **Behaviour:**
  - A "Coverage" toggle in the view menu.
  - Roads are shaded with existing tokens; each class differs by pattern as well as colour (solid, long dash, short dash,
    dotted).
  - The legend says "No reports is not the same as clear".
  - The brief says "3 flood-prone roads have no report in the last hour".
- **Automated tests:** vitest for the legend and the summary count.
- **Manual tests:** screenshots, light and dark.
- **Accessibility:** CVD test on the four classes; keyboard toggle.
- **Acceptance:** A road with no reports is never drawn in the positive (clear) colour.

## P1-4 Ask the crowd at data gaps

### P1-4.a Engine: `gapQuestions(plan, observations, nowS)`
Priority P1 · Status todo · Effort 1 h · Depends F-COV.b
- **Behaviour:** Returns the data-gap roads on the recommended route and the usual fastest route, ordered by position.
  Each comes with a structured question text, "Is {road} flooded right now?".

### P1-4.b API: answer semantics, limits
Priority P1 · Status todo · Effort 2 h · Depends F-COV.a
- **Behaviour:**

  | Answer | Effect |
  | --- | --- |
  | Yes | A flood report with the chosen depth, or `depth: null` for "Not sure of depth" |
  | No | A road-clear report: an observation only, never resolves or verifies |
  | Not sure | Nothing is sent to the server; the phone records it only for the prompt limit |

  Origin `prompt`. Throttled per device, with a server-side limit of one answer per road per device per 30 min (409 on a
  repeat).
- **Automated tests:** duplicate within 30 min returns 409; a No on a road with an open incident leaves the incident
  unchanged and sets `conflicting` per the existing rules; Yes creates an Unverified incident.

### P1-4.c Phone prompt, stationary only
Priority P1 · Status todo · Effort 2–3 h · Depends P1-4.a, P1-4.b
- **Behaviour:**
  - The prompt shows only when the phone is not on a trip, or when it is stopped (vehicle speed below walking pace for
    30 s). It never shows in Drive mode.
  - There is one prompt per road per 30 min.
  - Offline answers are saved as pending reports.
- **Automated tests:** jest for the gating rules, the frequency limit and the offline queue.
- **Device tests:** blocked (P0-3).

### P1-4.d Web question page for the stationary QR flow
Priority P1 · Status todo · Effort 1 h · Depends P1-4.b
- **Behaviour:** `/report?ask={road}` shows the same question on the public page. This is the live-demo path.
- **Acceptance:** A Playwright answer of Yes then No updates the coverage layer from "No reports" to "Fresh".

## P1-2 Verifiable decision receipt (decision D5)

### P1-2.a Engine: receipt builder
Priority P1 · Status todo · Effort 2 h · Depends P1-1.a
- **Behaviour:** `buildReceipt(input, plan)` returns:
  - **Versions:** `graphVersion`, `engineVersion`, `rulesHash` (a hash of SCORING_RULES), `profile`.
  - **Trip inputs:** origin, destination, `evaluatedAtS`.
  - **Scenario:** `scenarioId`, `seq`, `simulated`.
  - **Hashes:** `inputsHash`, `planHash`.

  It is encoded as a compact URL token.
- **Automated tests:**
  - round trip;
  - the same inputs give the same hash;
  - a change to any field changes it.

### P1-2.b Console `/verify`
Priority P1 · Status todo · Effort 2–3 h · Depends P1-2.a
- **Behaviour:**
  1. Fetches `/history`.
  2. Rebuilds incidents at the seq (`incidentsAtSeq`).
  3. Re-runs `planTrip` and compares.
  4. Shows "Same decision", or which of inputs or outputs differ.

  It states what this proves (the same rules on the same recorded inputs give the same route) and what it does not (that
  the reports were true, or who sent them).
- **Automated tests:** vitest with a tampered token.
- **Manual tests:** Playwright verification of a step-3 receipt.

### P1-2.c Share receipt (phone and console)
Priority P1 · Status todo · Effort 1.5 h · Depends P1-2.b
- **Behaviour:** A QR code and a link; the shared text includes "Simulated scenario" when `simulated`.
- **Automated tests:** jest for the share text.

## P2-6 Operator-drawn closures

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-6.a API | `POST /scenarios/:id/closures` (operator) with a polyline. It matches edges with the existing extent matcher (deterministic, sorted), returns a **preview** of the matched edges, then a confirm creates a Verified closure with source `operator` through the incident path | auth; deterministic matching; preview creates nothing; confirm logs an event and advances the seq | 2–3 h |
| P2-6.b Console | Click a road (or draw two points) → highlight the matched edges → confirm dialog → the closure appears; the route changes if affected | vitest; Playwright screenshots in both themes | 2–3 h |

Docs: CONTRACTS.md, UX_FLOWS.md §9.

## P2-1 After-action report

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-1.a | `/after-action`: a timeline built from `/history`, with operator actions, every route change and its reason, the modelled minutes compared with the usual route, provenance (graph, rules hash, scenario, Simulated) and receipts per change | vitest builds it from a recorded history; forbidden-words check (no "saved lives", no "hazard-free") | 2–3 h |
| P2-1.b | Print stylesheet; both themes on screen | screenshots | 0.5 h |

## P2-3 Step-free walking profile

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-3.a | Graph edge attribute `stepFree: true / false / null` (unknown). Fixture tags are hand-set and marked `stepFreeSource: 'fixture'` | schema; fixture build | 1 h |
| P2-3.b | Engine profile `step_free`: walking speeds; avoids `stepFree === false`; unknown edges allowed but counted, and confidence says "Step-free access unknown on N segments" | engine tests; parity case | 2 h |
| P2-3.c | Profile chip on the phone and the console | jest and vitest; screenshots | 1 h |

Docs: scoring.md, DATA_MODEL.md, limitations.md.

## P2-2 Offline QR relay

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-2.a | `ReportInput.clientReportId` (a UUID made on the device) and `observedAtS` (the device's claim, bounded to the last 2 h). The server keeps its own `receivedAt`; a repeat id returns the original receipt | dedupe; bounds; the server time is still authoritative for ordering | 2 h |
| P2-2.b | The phone shows a pending report as a QR code: a signed-by-nobody JSON with the schema version. States: pending, relayed, failed | jest | 1.5 h |
| P2-2.c | The console relay scanner (webcam via `getUserMedia`) and the phone scanner (`expo-camera`, a native install that is device-blocked) | vitest with a decoded payload; device blocked | 2–3 h |

Device ids are never treated as identity. The relayer is rate-limited like any reporter.

## P2-5 Rain alerts, read only

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-5.a | A CAP 1.2 alert adapter (SACHET publishes CAP), parsed against a **hand-written fixture marked as such**, because the feed was unreachable when this was written | parser; area filter for Mumbai; expiry | 2 h |
| P2-5.b | Alerts set the scenario's `alerts[]` in live mode only, with provenance and a freshness status; "Alert feed unavailable" with its age when it fails | API tests | 1.5 h |
| P2-5.c | Live run against the real feed | **blocked** (network) | 1 h |

## P2-4 Hospital load spreading

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-4.a | Hospital state (accepting, busy, diverting) set by an operator action, logged, labelled "Set by control room (simulated)" in the demo | API tests | 2 h |
| P2-4.b | Engine `assignHospital(trips, reachable, states)`: deterministic; adds the documented per-state cost; tie-break by hospital id | engine tests; parity | 2–3 h |
| P2-4.c | Console and phone show the assigned hospital and the reason | vitest and jest | 2 h |

## P2-7 Commute watch

| Task | Behaviour | Tests | Effort |
| --- | --- | --- | --- |
| P2-7.a | Saved trip and leave time (MMKV). A background re-plan uses existing capabilities first; `expo-background-task` is a native install | jest for "notify only when the recommendation differs from the saved usual route" | 3 h |
| P2-7.b | Device verification of background execution and notification permission | **blocked** (P0-3) | 1 h |

## P3

| Task | Behaviour | Status | Effort |
| --- | --- | --- | --- |
| P3-1.a | Icon-first mode: pictogram hazards, big route card, speech optional and off by default | todo (larger text and speech already exist) | 3 h |
| P3-2.a | Punjabi (spec language) strings plus catalog | todo; **native review required before "done"** | 2–3 h |
| P3-2.b | Native-speaker review of Hindi and Marathi | blocked (reviewer) | — |
| P3-3.a | iOS build on hardware | blocked (no Mac or iPhone) | 3 h + device |
| P3-4.a | Operator identities (named tokens), role check on the server, actor recorded in `incident_events` | todo | 3–4 h |
| P3-5.a | Device reputation weight: an optional heuristic; never sets Verified; manipulation tests | todo (after P3-4) | 3–4 h |
| P3-6.a | SMS gateway for outbound route text | blocked (provider credentials) | 3 h |
| P3-7.a | Public read-only incidents page: status, source, age, provenance; no device ids or notes metadata | todo | 2 h |
