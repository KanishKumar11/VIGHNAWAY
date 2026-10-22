# PRD.md: VIGHNAWAY product brief

Owner: Pitch and QA. Domain: vighnaway.app (configuration, not an assumption).

## Problem

In a Mumbai monsoon, the fastest route is often the one that floods first: underpasses below the
Western Railway fill with water, flyovers jam, and navigation apps keep sending drivers into both.
The evidence that a road is blocked exists (people on the spot, operators, alerts) but it is
scattered, unverified and invisible at the moment of choosing a route.

## Target user

A driver, rider or pedestrian who must cross the railway in Andheri during heavy rain, typically to
reach a hospital; and the control-room operator who verifies reports.

## The five questions VIGHNAWAY answers

1. Which route should I take right now? (one recommended, viable route and its ETA)
2. Why that one? (one sentence, with the evidence: source, status, age)
3. What am I trading off? ("+5 min compared with the usual fastest route")
4. How sure is that? (High / Medium / Low, never a percentage)
5. What would change the answer? ("Re-check if the report at Andheri Subway is corroborated")

## Primary journey

Open the app (first-run: "Simulated flood scenario: Andheri, Mumbai") → destination hospital is
preset → see the recommended route, reason and confidence → Start trip → while driving, reports
arrive; VIGHNAWAY re-plans from the vehicle's position only when the rules justify it, buzzes,
explains in one banner, and records it in Activity → arrive, or, if no route is viable, see the
nearest reachable hospital and "In an emergency, call 112".

## The three proofs for judges

1. **A different decision from shortest-path routing:** the usual fastest route (Andheri Subway) is
   shown and loses once corroborated knee-deep flooding blocks it.
2. **The reason with its evidence:** every banner and card names the incident, its status
   ("Corroborated (2 devices)", "Verified by operator (simulated)"), its source (Simulated) and age.
3. **Changes when evidence changes, holds when it does not:** one unverified ankle-deep report does
   not move the route ("Route unchanged: one unverified report"); corroboration does; an operator's
   Verify changes the status but not an already-correct decision; replay after Reset is identical.

## Scope

- **Must:** monorepo; dev build with Google map; first-run screen; three locked hero screens; graph
  extract and seed; engine with tests; API reports, snapping, corroboration, operator actions,
  gateway with seq resync; simulation runner; app shell meeting BUILD_PROMPT section 8; Navigate;
  en-route mode with re-planning and trip relay; evidence sheet, banner, haptic, local notification;
  Report modal; control room; report page; edge states; tests; release APK and backup video.
- **Should:** vehicle profiles; reachable destination; SMS share; offline mode.
- **Stretch:** iOS build; evacuation load spreading; Hindi and Punjabi strings; read-only SACHET
  alert banner.
- **Out:** accounts, ML forecasting, LLM routing decisions, dispatch, Expo Go.

## Success criteria

- The scripted scenario runs end to end on two screens in under 3 minutes, three rehearsals in a
  row, with identical decisions after each Reset.
- An operator Verify on the console reaches the phone within 2 seconds.
- planTrip under 200 ms on a mid-range Android phone (measured on the debug screen).
- Every decision visible on stage can be traced to a rule in docs/scoring.md.

## Judging criteria mapping

The hackathon's official criteria were not provided with this brief; the mapping below uses the
usual criteria and must be replaced with the published ones.

| Criterion (assumed) | Feature or demo moment |
| --- | --- |
| Problem relevance / impact | Andheri subway flooding story; hospital destination; "In an emergency, call 112" |
| Innovation | Evidence-weighted routing with corroboration, staleness and data gaps; switching rule that resists noise |
| Technical execution | Same pure engine on phone and console with matching parity hash; PostGIS snapping and corroboration; seq resync |
| Design / UX | Route strip, Why this route card, evidence chips, the route-change moment on both screens |
| Demo quality | Two-screen scripted scenario, judge reports by QR, Reset and replay |
| Responsibility / ethics | Simulated labels everywhere, no "safe" wording, prototype heuristic disclaimer, operator-only Verified |
