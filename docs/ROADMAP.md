# ROADMAP.md: features to add, in priority order

Owner: Platform (lead). Last reviewed 2026-10-22. This is the list of things we could still build. Pick from the top and
work down as time allows; each item is sized so it can be finished, tested and demoed on its own.
IDs here are stable. Do not delete an item when it ships or is blocked. The status of every item lives in
docs/ROADMAP_STATUS.md. The task breakdown with acceptance criteria and evidence lives in docs/TASKS.md. The order and
the reasons for it are in docs/IMPLEMENTATION_PLAN.md and docs/DEPENDENCY_MAP.md.

Every item below obeys AGENTS.md:
- routing decisions come only from packages/engine, deterministic, no LLM;
- never "safe", "safest", "guaranteed" or a safety percentage;
- simulated data is always labelled;
- only an operator sets Verified.

An item that changes packages/contracts, packages/tokens or SCORING_RULES must update the matching docs/ file in the
same change.

## How to read this

| Column | Meaning |
| --- | --- |
| **Effort** | Focused hours for one agent, including tests and screenshots. |
| **Demo value** | ★★★ a judge will remember it · ★★ strengthens the story · ★ only matters if asked. |
| **Owners** | Workstreams per AGENTS.md folder ownership. |
| **Needs** | Things that must be available first: a person, hardware, credentials or network. |

Priorities:
- **P0**: the demo is at risk without it.
- **P1**: highest standout value per hour.
- **P2**: strong additions if time remains.
- **P3**: nice to have, or post-hackathon.

## Time-boxed plans

If we only have a fixed amount of time, build these, in this order:

| Time left | Build |
| --- | --- |
| **4 hours** | P0-1 → P0-2 → P1-1 (Why not that route?) |
| **8 hours** | the 4-hour plan → P1-2 (decision receipt) → P1-3 (judge-in-the-loop) |
| **16 hours** | the 8-hour plan → P1-4 (ask the crowd) → P1-5 (evidence coverage map) → P2-1 (after-action report) |
| **24+ hours** | the 16-hour plan → P2-2 (offline QR relay) → P2-3 (step-free profile) → P2-4 (hospital load spreading) |

P2-8 and P2-9 (walking concerns and the well-lit preference) come after the 24+ hour plan and are cut before P2-5.

The device and credential items (P0-3 to P0-6) run in parallel whenever the person or hardware is available. They are
not coding time for an agent.

---

## P0: finish what is planned (demo risk)

### P0-1 Finish and lock the mobile design pass
- **What:** the in-progress DESIGN_VISION pass on the phone. Review the hero screens in light and dark against the §13
  checklist, then commit the screenshots in docs/design/preview.
- **Effort:** 1–2 h · **Demo value:** ★★★ · **Owners:** Mobile
- **Done when:** tsc, jest, eslint and the Android export pass, and the hero screens are reviewed in both themes.

### P0-2 Localize the detailed engine sentences
- **What:** short engine text is already composed per language on the phone from structured plan fields
  (`apps/mobile/src/i18n/engineText.ts`). The detailed explanations still appear in English in every language:
  - "Why this route";
  - re-check lines;
  - confidence reasons;
  - rule descriptions.
- **How:** the engine also returns `{ key, params }` for each sentence. Clients render the key from their i18n file;
  the English string stays the source of truth and the parity input.
- **Effort:** 3 h · **Demo value:** ★★ (★★★ if judges are local) · **Owners:** Engine, then Mobile and Console
- **Docs:** CONTRACTS.md (new optional fields on `Explanation` and `RouteChange`).
- **Done when:**
  - a test renders every key in en, hi and mr with no missing params;
  - the parity hash is unchanged;
  - `findForbiddenWords` passes in all three languages.
- **Still needed afterwards:** native-speaker review (docs/limitations.md).

### P0-3 Real Android run (T06, T09, T10, T13, T15, T20)
- **What:** Google Maps on a real phone, the §8.7 checklist, the parity hash on the phone's debug screen, notifications,
  and a release APK on two phones.
- **Effort:** 3–4 h with a phone · **Demo value:** ★★★ · **Owners:** Mobile, QA
- **Needs:** an Android phone, a Google Maps Android key (restricted by package and SHA-1), a laptop with the
  Android SDK.

### P0-4 Real road graph (T04)
- **What:** run `scripts/extract_graph.py` with network access, review the overlay at the three crossings, fill
  `flood-prone.json`, then re-tune the scenario.
- **Effort:** 2 h · **Demo value:** ★★★ (routes line up with the Google basemap) · **Owners:** Data and sim
- **Needs:** Overpass or OpenStreetMap access.

### P0-5 Rehearsals and backup video (T22)
- **What:** three timed runs under 3 minutes, logged in docs/demo-script.md, plus a screen recording as a fallback.
- **Effort:** 1.5 h · **Demo value:** ★★★ · **Owners:** Pitch, QA
- **Needs:** the team, and the judging criteria so the script can be weighted to them.

### P0-6 API Docker image and live TomTom key (T03)
- **What:**
  - finish the API image build;
  - optionally run the live scenario against the real TomTom service.

  The adapter is tested only against a recorded response.
- **Effort:** 1 h · **Demo value:** ★ (★★ if we show live mode) · **Owners:** API, Platform
- **Needs:** a TomTom key, and a network without the sandbox proxy.

---

## P1: standout features (highest value per hour)

### P1-1 "Why not that route?" counterfactuals
- **What:** tap any rejected route to see the smallest change that would make it the recommendation, for example:
  > Via Andheri Subway would be recommended if the flooding (knee deep) were cleared, or if it were 4 min faster.
- **Why it wins:** most routing demos only say what to do. This one shows where the decision would flip, which makes
  the deterministic rules visible.
- **How:** in the engine, for each shown route, re-rank with each of its active hazards removed one at a time, and
  compute the time gap to the switching threshold (`gain > 120 s and gain × 10 > cost`). This is pure arithmetic on
  values that `evaluate` already returns, so there are no new searches.
- **Effort:** 3–4 h · **Demo value:** ★★★ · **Owners:** Engine, then Console (decision panel) and Mobile (comparison
  card)
- **Docs:** CONTRACTS.md (`RouteEvaluation.counterfactual`), scoring.md.
- **Done when:**
  - engine tests cover the three cases: blocked, hazard-penalised, slower only;
  - a property test checks that applying the stated change really flips the ranking;
  - the parity hash covers the new field.

### P1-2 Verifiable decision receipt
- **What:** every recommendation gets a short receipt: graph version, incident snapshot seq, profile, origin and
  destination, engine version, the plan hash, and a QR code. Scanning the QR opens `/verify` on the console, which
  re-runs the same engine in the browser from the history endpoint and shows "Same decision: hash a3f9…" or what
  differs.
- **Why it wins:** anyone can audit an emergency routing decision afterwards. It builds on the parity hash and the
  `/history` endpoint we already have.
- **Effort:** 3 h · **Demo value:** ★★★ · **Owners:** Engine (receipt and hash), Console (/verify), Mobile (Share
  receipt)
- **Done when:**
  - a receipt from step 3 of the demo verifies on a second machine;
  - a tampered receipt shows a mismatch;
  - shared text carries the Simulated label.

### P1-3 Judge-in-the-loop demo
- **What:** a presenter-mode panel with a large QR code to `/report`. Judges file a hazard from their own phones; the
  room watches it go from Unverified to Corroborated (2 devices) to Verified (by the operator), and watches the route
  change.
- **How:**
  - an "audience" source tag, so these reports are listed separately and can be cleared in one action;
  - a per-device rate limit (already exists);
  - plain-text notes (already enforced).
- **Effort:** 2 h · **Demo value:** ★★★ · **Owners:** Console, API (source tag and bulk clear)
- **Risk:** the room's Wi-Fi. Keep the scripted simulation as the fallback; the panel only adds to it.
- **Done when:** two browsers in Playwright file reports at one point, the console shows Corroborated, and the route
  changes.

### P1-4 Ask the crowd at data gaps
- **What:** a flood-prone road with no report in 60 min during a rain alert already costs a 120 s penalty and lowers
  confidence. Now, a phone near that road (or on a route through it) gets a one-tap question: "Is Andheri Subway
  flooded right now? Yes / No / Not sure".
  - **Yes** files a flood report.
  - **No** files a Road clear report.
- **Why it wins:** the system asks for the evidence it is missing instead of only guessing around it, which turns
  Medium confidence into evidence.
- **Effort:** 3 h · **Demo value:** ★★★ · **Owners:** Mobile, Console (/report variant), Engine (exposes gaps; it
  already computes `dataGaps`)
- **Rules:**
  - at most one prompt per road per device per 30 min;
  - never while the vehicle is moving faster than walking pace;
  - answers are ordinary reports with ordinary status, never auto-Verified.

### P1-5 Evidence coverage map
- **What:** a console layer that shades each flood-prone road by how recent its evidence is:
  - fresh;
  - ageing (30 min to 3 h);
  - stale;
  - no reports.

  The Situation brief gets a line such as "3 flood-prone roads have no report in the last hour".
- **Why it wins:** it shows operators where they are blind, not just where the hazards are. It pairs with P1-4.
- **Effort:** 2 h · **Demo value:** ★★ · **Owners:** Console
- **Tokens:** reuse the warn and danger scales and add no new hues; the CVD test must still pass.

---

## P2: strong additions

### P2-1 After-action report
- **What:** at the end of a run, one click produces a printable page built from `/history`:
  - the timeline of incidents and operator actions;
  - every route change with its reason;
  - time on hazard-free roads versus the usual fastest route.

  It is labelled "Simulated scenario" throughout.
- **Effort:** 2 h · **Demo value:** ★★ · **Owners:** Console
- **Rule:** report minutes compared with the usual route, never "lives saved" or a safety number.

### P2-2 Offline QR relay
- **What:** a phone with no network still files a report; it is saved as pending (this already exists). Now the phone
  can also show the report as a QR code. Any phone or console with a network scans it and relays it. The report keeps
  its original device id and the time it was observed, and the server still assigns the received time.
- **Why it wins:** during a flood, mobile data is often what fails first.
- **Effort:** 5 h · **Demo value:** ★★★ · **Owners:** Mobile (expo-camera: native package, so rebuild the dev
  client), Console (scan with the webcam), API (relay endpoint, deduplicated by report id)
- **Needs:** P0-3 for an honest on-device demo.

### P2-3 Step-free walking profile
- **What:** a fourth profile that avoids stairs-only footbridges and subway steps. It serves wheelchair users, people
  with prams and older people.
- **Effort:** 3 h · **Demo value:** ★★ · **Owners:** Data (edge tag `stepFree`), Engine (profile filter and rule),
  Mobile (profile chip)
- **Docs:** scoring.md, DATA_MODEL.md.
- **Limit:** real tags exist only after P0-4. On the fixture the tags are hand-set and must be labelled as such.

### P2-4 Hospital load spreading (PRD Stretch)
- **What:** when several trips head for "nearest hospital", the engine spreads them across reachable hospitals. An
  operator sets each hospital's state (accepting, busy, diverting); the cost adds a declared per-state penalty.
- **Effort:** 6 h · **Demo value:** ★★ · **Owners:** Engine, API (hospital state, operator action), Console
- **Rule:** deterministic, so the same inputs always give the same assignment; the tie-break is by hospital id.

### P2-5 SACHET or IMD rain alerts, read only (PRD Stretch)
- **What:** ingest the public CAP alert feed for Mumbai, which sets `hasAlertInformation` and the rain-alert state that
  drives the data-gap rule. Build it like the TomTom adapter: a recorded fixture for tests, and a status line on the
  console.
- **Effort:** 4 h · **Demo value:** ★★ · **Owners:** API, Data
- **Needs:** network access to the feed for a live run.

### P2-6 Operator-drawn closures
- **What:** the operator draws a line or polygon on the console map. It becomes a Verified closure on the matched
  edges, with its source shown as "Control room".
- **Effort:** 3 h · **Demo value:** ★★ · **Owners:** Console, API (reuses incident extent matching)

### P2-7 Commute watch
- **What:** save a usual trip and its leave time. Before the leave time, the phone re-plans in the background and sends
  a notification only if the recommendation differs from the usual route.
- **Effort:** 4 h · **Demo value:** ★★ · **Owners:** Mobile
- **Needs:** P0-3 (background tasks only work on a device).

### P2-8 Walking-concern reports (poorly lit, isolated)
- **What:** two new report types in the report sheet, "Poorly lit" and "Isolated stretch". They are ordinary incidents
  on a road, with a source and a status, and appear on both maps as factual labels, for example "Reported poorly lit ·
  2 reports · 40 min ago · Unverified".
- **Why it wins:** people walking after dark, women most often, can add and read first-hand evidence about a road. No
  area is ever rated. The incident pipeline already handles expiry, corroboration and operator review.
- **Rules (these are the safeguards, not options):**
  - the report describes a road and a condition, never a neighbourhood or a group of people;
  - no safety wording ("safe", "unsafe", "dangerous") and no area shading or score;
  - the app never asks for or stores gender, age or identity; the device hash is the only identifier;
  - no free-text note on these types, so a report cannot name a person or premises;
  - a stricter per-device limit than other report types;
  - only an operator sets Verified; an operator can dismiss or resolve.
- **Scope:** display only. This item changes no route. The routing effect belongs to P2-9 and applies only when the user
  turns that preference on, so the engine, scoring rules and parity hash stay unchanged here.
- **Effort:** 5–6 h · **Demo value:** ★★ · **Owners:** API (contracts, reports), Engine (reviews contracts and keeps the
  new type out of routing), Console (layer and queue), Mobile (report sheet and map labels)
- **Docs:** CONTRACTS.md (new incident and report type), DATA_MODEL.md, UX_FLOWS.md, limitations.md.
- **Done when:**
  - two browsers report "Poorly lit" on one road and the console shows Corroborated;
  - the planner's recommendation and the parity hash are unchanged;
  - `findForbiddenWords` passes on the new strings in en, hi and mr;
  - the per-device limit and the note rejection are covered by API tests.

### P2-9 Prefer well-lit roads (walking preference)
- **What:** an opt-in toggle on the walking profile, "Prefer well-lit roads". It adds two declared, ranking-only rules to
  SCORING_RULES, so the displayed ETA is untouched:
  - a way tagged `lit=no` in OpenStreetMap costs 25% extra of its travel time in the ranking;
  - an open walking-concern incident on the route costs 300 s × verification weight × age factor.
- **Never:** a hard block, a "safer" label or a safety percentage. The card says "Preference: well-lit roads".
  Where the `lit` tag is missing, nothing changes, the missing segments are counted, and confidence reads "Lighting data
  missing on N segments" (the same pattern as P2-3).
- **Off by default,** so the demo and the parity hash are unchanged until the toggle is on. The preference is a plan
  input, so the decision receipt (P1-2) records it.
- **Effort:** 6 h · **Demo value:** ★★ · **Owners:** Data (keep `lit` in the extract), Engine (rules, profile input,
  parity cases), Mobile (toggle and card), Console (decision panel line)
- **Needs:** P2-8 for the incident half. The `lit` half can ship first. A coverage check of the `lit` tag in the Andheri
  graph, because if it is thin the feature says so rather than pretending.
- **Docs:** scoring.md (regenerated from rules.ts), CONTRACTS.md (plan input), DATA_MODEL.md (`lit` edge attribute),
  limitations.md.
- **Done when:**
  - engine tests cover `lit=no`, unknown and `lit=yes` edges, plus the incident penalty at each status;
  - a property test shows the preference never makes a route non-viable;
  - with the toggle off, all existing parity and replay hashes are identical;
  - the shared route text carries no safety wording.

---

## P3: nice to have, or after the hackathon

| ID | Feature | Effort | Notes |
| --- | --- | --- | --- |
| P3-1 | Large-text, icon-first mode for low-literacy users (pictogram hazards, spoken change by default) | 3 h | Builds on `spokenChange` and expo-speech |
| P3-2 | More languages: Punjabi, Gujarati, Tamil | 2 h each | Each needs native review before use |
| P3-3 | iOS build | 3 h + device | PRD Stretch; untested today |
| P3-4 | Operator roles and audit log (who verified what) | 4 h | Replaces the shared demo token; `/history` already records actions |
| P3-5 | Device reputation for corroboration (reports later confirmed raise weight) | 4 h | Must stay a documented heuristic; never sets Verified |
| P3-6 | SMS route text for feature phones (outbound) | 3 h | Needs an SMS gateway; the share path exists today |
| P3-7 | Public read-only incident page (no operator controls) for citizens without the app | 2 h | Same labels and statuses as the console |
| P3-8 | Share my trip: an expiring, revocable link a contact opens to follow the phone's position | 6 h + device | Needs a privacy decision first (consent, expiry, what is stored). Position and destination name only, never the route. In the demo the position is the simulated vehicle and is labelled so |

## Not doing (and why)

| Idea | Why not |
| --- | --- |
| LLM-written explanations or LLM ranking | Breaks the rule of deterministic decisions only, and the parity hash |
| A flood or safety "score" or percentage | Forbidden by the non-negotiables; confidence stays a decision-table label |
| Photo uploads on reports | Needs moderation and storage, and carries privacy risk; notes stay plain text |
| ML flood prediction | No validated data; it would present guesses as evidence |
| Safe or unsafe areas, or a safety score, for women or anyone | No evidence source can support it; it is the forbidden safety claim in another form, and a wrong label stigmatises a place or gives false reassurance. P2-8 and P2-9 show reports and a stated preference instead |
| Crime-statistics overlay | Sparse, delayed and biased by under-reporting; shading areas from it would read as a verdict |
| Collecting gender or identity to tailor safety features | Not needed, and it adds privacy risk; the features work the same for everyone |
| A hosted routing API for the decision | Decisions must come from packages/engine |
