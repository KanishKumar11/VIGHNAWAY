# IMPLEMENTATION_PLAN.md: how the roadmap gets built

Owner: lead agent. Created 2026-10-22 from an audit of the repository at commit `f8f85a4`.

Related files:

| File | What it holds |
| --- | --- |
| docs/ROADMAP.md | What we might build |
| docs/TASKS.md | Every task, with acceptance criteria and evidence |
| docs/DEPENDENCY_MAP.md | Order and dependencies |
| docs/ROADMAP_STATUS.md | Where we are now |

This file explains why the work is ordered as it is.

## 1. Current state (audited, not assumed)

### Baseline checks, run 2026-10-22 on `f8f85a4`

| Check | Result |
| --- | --- |
| `pnpm test` (turbo, 11 tasks) | Pass, 381 tests: tokens 104, contracts 11, scenario-data 5, engine 48, API 45 (on PostGIS 3.4), console 91, mobile 77 |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| Mobile Android export | Pass (2,512 modules), run by the mobile agent |

### What the build environment can and cannot do

| Capability | Available | Consequence |
| --- | --- | --- |
| Postgres 16 + PostGIS 3.4, Node, pnpm, Playwright and Chromium | Yes | API, console and engine work can be fully verified |
| Docker | Yes, through a proxy with its own CA | The API image build can be retried (P0-6) |
| Android SDK, emulator or phone | No | Every on-device check stays blocked |
| Network access to Overpass, OpenStreetMap, TomTom, SACHET or Google | No (proxy rejects these hosts) | P0-4, the live run in P0-6 and live P2-5 stay blocked |
| A Google Maps key | No | Maps run only as the labelled schematic view |
| People for rehearsals | No | The timed runs in P0-5 stay blocked |

### Status classes

| Class | Meaning |
| --- | --- |
| **Complete and verified** | Implemented, and acceptance tests were run here |
| **Implemented, unverified** | In code, but the required behaviour is not fully tested |
| **Partial** | Some of it exists, with named gaps |
| **Blocked** | Needs hardware, credentials, network or people |
| **Not started** | No meaningful implementation |
| **Broken** | Fails an acceptance requirement |

### Roadmap items

| ID | Item | Class | Evidence |
| --- | --- | --- | --- |
| P0-1 | Mobile design pass | Partial | **Complete:** the browser-preview build (38 screenshots in docs/design/preview; tsc, eslint, jest 77, export). **Not done:** the device review, the offline-state recapture, and the landscape Drive decision (§2) |
| P0-2 | Detailed engine sentences localised | Partial | **Localised on the phone:** short text, rebuilt from plan fields in `apps/mobile/src/i18n/engineText.ts`. **Still English:** reasons, trade-offs, re-check lines, confidence reasons and rule text, on both clients (`packages/engine/src/explain.ts` builds English strings only) |
| P0-3 | Real Android run | Blocked | No SDK or phone (TASKS T06, T09, T10, T13, T15, T20) |
| P0-4 | Real road graph | Blocked | Overpass rejected by the proxy. `scripts/extract_graph.py` is unit-tested offline; the graph is the schematic fixture `fixture-1f7635ec4925` |
| P0-5 | Rehearsals and backup video | Partial | `docs/demo-script.md` exists. No reset runbook, recovery drill, recording or timed runs |
| P0-6 | API Docker image and live TomTom | Partial | Compose file validates and the PostGIS container is healthy; the API image build did not finish (proxy CA). The TomTom adapter is tested only against a recorded fixture (10 tests) |
| P1-1 to P1-5 | Standout features | Not started | `grep` finds no counterfactual, receipt, audience, coverage-layer or crowd-question code |
| P2-1 to P2-7 | Strong additions | Not started | Building blocks that already exist: pending offline reports (S4), reachable destination (S2), operator source, the `/history` endpoint, incident extent matching |
| P3-1 | Large-text, icon-first mode | Partial | 1.25× larger text and opt-in spoken changes exist on the phone; there is no icon-first mode |
| P3-2 | More languages | Partial | Hindi and Marathi exist with no native review. The spec (PRD, BUILD_PROMPT) names **Hindi and Punjabi**; Marathi came from the approved design plan (DESIGN_VISION App. A). Punjabi is not started |
| P3-3 | iOS | Not started | Untested |
| P3-4 | Operator roles and audit log | Partial | `incident_events` records every transition with a timestamp; there is one shared token and no operator identity |
| P3-5 | Device reputation | Not started | — |
| P3-6 | SMS route text | Partial | Outbound share with the Simulated label exists (S3, expo-sms or the share sheet). No gateway |
| P3-7 | Public read-only incident page | Not started | The public `/report` page exists; there is no read-only incident view |

Nothing is classed **Broken**: every automated suite passes.

### Documentation defects found during the audit (fixed in task P0-0)

- `docs/UX_FLOWS.md` §7 says "Hindi and Punjabi marked Coming later". The app ships Hindi and Marathi.
- `docs/TASKS.md` T07 says the engine has 44 tests; it has 48. T19 says 172 automated tests; there are now 381 (plus the Python graph tests).
- The latest commit is labelled "WIP (unverified)", but its tree has since been verified. Record the verification in ROADMAP_STATUS rather than rewriting history.

## 2. Fix before new development

1. **P0-0, documentation sync.** Fix the defects above.
2. **Language scope.** Record, but do not change, the language list:
   - the spec says Hindi and Punjabi;
   - the build has Hindi and Marathi.

   Recommendation: for Mumbai judges, Marathi plus Hindi is the better pair. Punjabi is a P3-2 task, estimated at 2–3 h for strings plus native review. The owner decides.
3. **Landscape Drive mode.** The app is locked to portrait, so the landscape Drive layout cannot be reached. This needs an owner decision on `expo-screen-orientation`, which is a native install and a dev-client rebuild. Until then, Drive mode is documented as portrait-only.

No code defect blocks new work.

## 3. Key technical decisions this plan makes

| # | Decision | Why |
| --- | --- | --- |
| D1 | Engine sentences become **structured text**: `{ key, params }` plus the English string. One catalog (en, hi, mr) lives in `packages/engine/src/text/`, with a pure `renderText(text, lang)` | One catalog for both clients, so they cannot drift. The English output stays byte-identical, so the parity hash does not change. The engine still decides nothing based on language |
| D2 | **Evidence coverage** becomes a first-class engine input. The API publishes the latest observation time per edge, including Road clear reports, and the engine uses it for the data-gap rule | P1-4 and P1-5 both need it. **This is a scoring-rule change:** a Road clear report on a flood-prone edge now counts as coverage. It is documented in scoring.md, never resolves an incident and never sets Verified |
| D3 | Counterfactuals are computed **from already-evaluated routes only**: no new searches, and every claim is re-checked by re-ranking | Keeps them deterministic and cheap, and means each claim is actually established |
| D4 | Audience reports use the **normal report path** with an `origin: 'audience'` tag. Bulk clear is an operator action that dismisses them, logged in `incident_events` | Required by the brief: no bypass of report processing |
| D5 | The receipt hashes **canonical inputs and outputs** separately. `/verify` re-runs `planTrip` from `/history` at the recorded seq | Separates reproducibility (provable) from authenticity (not provable) |
| D6 | The P0 gate is split into a **sandbox gate**, which must pass before P1, and a **device gate**, which is tracked and does not block P1 | No P1 feature depends on a phone. Waiting on hardware we do not have would stall all work; the device gate stays visibly open in ROADMAP_STATUS |

## 4. Execution sequence

The order follows dependencies first, then value per hour.

```text
P0-0 docs sync
P0-2 structured engine text (D1)         ← every later engine feature emits structured text
P0-6a API Docker image
P0-5a-c demo runbook, recovery drill, recorded console fallback
P0-4p graph validation script (runs on the fixture now, on OSM later)
── sandbox P0 gate ──
P1-1 counterfactuals
P1-3 judge-in-the-loop
F-COV coverage input (D2)                ← foundation shared by P1-5 and P1-4
P1-5 evidence coverage map
P1-4 ask the crowd
P1-2 decision receipt
── P1 gate ──
P2-6 operator-drawn closures
P2-1 after-action report
P2-3 step-free profile
P2-8 walking-concern reports                ← display only; contracts change, one at a time
P2-9 prefer well-lit roads                  ← after P2-3 (both extend the plan input) and P2-8
P2-2 offline QR relay
P2-5 rain alerts (CAP adapter, fixture-tested)
P2-4 hospital load spreading
P2-7 commute watch
── P2 gate ──
P3-7 public read-only page
P3-4 operator roles and audit
P3-1 icon-first mode
P3-5 device reputation
P3-6 SMS gateway
P3-2 more languages
P3-3 iOS
── P3 gate ──
```

Device-gated tasks run whenever a phone and a person are available:
- P0-1c (device design review);
- P0-3 (real Android run);
- the phone checks inside each P1 and P2 feature.

Network-gated tasks need the hosts allowed: P0-4a–d (road graph), P0-6b (live TomTom), and the live half of P2-5 (rain alerts).

Why P1-3 comes before P1-5 and P1-4: P1-3 builds only on the existing report path and is the core of the live demo. P1-5 and P1-4 both need the coverage foundation (F-COV) first.

## 5. Deferrable without hurting the core demo

The core demo is:
1. the usual fastest route differs from the recommended one;
2. a report changes the route;
3. the operator verifies;
4. the reason is explained.

Defer in this order if time runs short:
1. P3 (all);
2. P2-7 (commute watch);
3. P2-4 (hospital load spreading);
4. P2-9 (prefer well-lit roads);
5. P2-8 (walking-concern reports);
6. P2-5 (rain alerts);
7. P2-2 (offline QR relay);
8. P2-3 (step-free profile);
9. P2-1 (after-action report);
10. P2-6 (operator-drawn closures).

Protect these:
- P0-2, P1-1, P1-3, P1-5 and the rehearsed demo;
- deterministic routing and parity.

## 6. Testing requirements

Every feature runs the checks that apply from the list below. Results are recorded in TASKS.md with the command and its output count.

| Layer | Required |
| --- | --- |
| Engine | Unit and boundary tests, a property test where a claim must hold (P1-1), parity hash, `pnpm --filter @vighnaway/engine bench` when search changes |
| Contracts | Schema tests, and CONTRACTS.md updated in the same commit |
| API | Supertest against `vighnaway_test` covering validation, auth, rate limit, transaction and seq, plus socket broadcast |
| Console | Vitest components; a Playwright run against the real API on :4000 with screenshots in both themes (`apps/console/screenshots/`) |
| Mobile | Jest/RNTL, tsc, eslint, Android export; browser-preview screenshots in both themes; device checks listed separately as blocked |
| Accessibility | Tokens contrast and CVD tests for any new colour use; keyboard path for new console controls; labels; reduced motion |
| Integration | The 7-step demo replay (`pnpm --filter @vighnaway/scenario-data tune` and the API e2e) still gives identical plan hashes |

Never remove or weaken a test to make a feature pass.

## 7. Visual design and accessibility requirements

Every UI change follows docs/DESIGN_VISION.md:
- the fixed palette, with no new hues;
- no perpetual motion;
- mono only for technical text;
- status shown by rings and words, not colour alone;
- light and dark both reviewed.

New layers (coverage, counterfactual, closures) reuse the status tokens. The tokens contrast and CVD tests must stay green.

## 8. Integration risks

| Risk | Mitigation |
| --- | --- |
| Structured text changes the parity hash | The hash covers the English output only; a test asserts the hash is unchanged |
| Coverage input changes engine results for existing scenarios | Before/after replay comparison; scenario re-tuned only if a demo step changes, and recorded |
| Audience reports pollute a later demo | Tagged origin, one-action clear, and a reset runbook |
| Room Wi-Fi fails during the judge flow | The scripted simulation stays the primary path; audience reports only add to it |
| Contracts drift between clients | Contracts and docs change in the same commit; both clients typecheck in CI |
| Fixture-only geometry | Everything labelled "schematic fixture" until P0-4 |

## 9. Milestones and gates

| Gate | Passes when |
| --- | --- |
| **G-P0 sandbox** | P0-0, P0-2, P0-6a, P0-5a–c and P0-4p done with evidence. All suites green. The demo replay hashes are unchanged |
| **G-P0 device** | P0-1c, P0-3, P0-4a–d and P0-5d done. Tracked; needs hardware, network and people |
| **G-P1** | All seven checks below shown in one recorded console run against the real API, with phone parity shown by matching plan hashes in tests: (1) an alternative route is explained; (2) a judge submits an incident; (3) it appears with its real status and source; (4) the engine reacts per the rules; (5) console and phone agree; (6) the coverage layer shows missing evidence; (7) the decision reproduces from the receipt |
| **G-P2** | Each P2 item done, or explicitly deferred, with tests, docs and source labels |
| **G-P3** | Each P3 item's state recorded honestly |

## 10. Definition of done for the roadmap

Every item is one of: **complete and verified** with linked evidence, or **blocked or deferred** with the reason and the exact next step.

The demo proves every point in the brief:
- the recommended route differs from the usual fastest one, by documented rules;
- evidence, freshness and status change the evaluation;
- reports and operator actions propagate to both clients;
- rejected routes are explained by counterfactuals that were actually checked;
- missing evidence is visible;
- decisions reproduce from receipts;
- the run repeats and has a documented fallback;
- both themes pass the visual and accessibility checks.

No claim of real-world emergency readiness is made.
