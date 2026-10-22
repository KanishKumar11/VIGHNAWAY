# Known limitations

Shown (summarised) on the app's How it decides screen and the console's /rules page.

## Data

- **Simulated conditions in the demo.** Every flood, closure and congestion in the simulated demo
  scenario is simulated. In live mode, incidents come from real user reports, operators and the
  TomTom feed, each labelled with its source; VIGHNAWAY never says a real road is flooded or closed
  unless a named source reported it.
- **Real roads, with hand-set exceptions.** The committed `graph.json` is an OpenStreetMap extract of
  Andheri (attribution shown). Two things in it are hand-set and labelled: the Andheri Subway name and
  flood-prone mark (see below), and the schematic fixture kept only for engine tests
  (`packages/engine/test/fixtures`). The OpenStreetMap extract has not been checked against the Google basemap
  on a device.
- **Speeds are illustrative** monsoon-traffic defaults per road class, not measurements.
- **Overlaying OSM-derived routes on Google Maps:** the team must confirm this fits both
  providers' terms before any public release.

## Evidence

- **Corroboration by device is a heuristic.** Two device ids within 150 m and 30 minutes count as
  "Corroborated (2 devices)". Device ids are random and self-reported; one person with two phones
  can corroborate. It is not proof of independent witnesses. Only an operator sets Verified.
- **Operator access is demo-grade.** A shared bearer token typed into the console and kept in
  sessionStorage.
- **Road clear reports** on a flood-prone road count as a recent observation for the data-gap rule and the
  coverage layer (the API publishes the latest report per flood-prone road). They never resolve an incident
  and never set Verified.
- **Incident extent** is modelled as the reported road within 60 m (600 m for congestion) of the
  report, in both directions.

## Routing

- **Candidates are limited** to Yen k-shortest paths (k = 5, budgeted), edge-penalty alternatives
  and the best path around current hazards. A better route outside that set can be missed.
- **Penalties are not probabilities.** Confidence is a label from a decision table.
- **Live traffic** comes only from the optional TomTom feed in the live scenario (docs/live-traffic.md); it is untested against the real service and needs the OSM graph to match real geometry. No forecasting, no LLM.
- **Performance on phones is unmeasured** in this repository: planTrip runs in about 1 ms on the
  fixture and about 50 ms on a 3,900-node synthetic grid in Node; the 200 ms Hermes budget must be
  checked on the device's debug screen.

- **The scoreboard measures a test set, not the world** (docs/scoreboard.md). Hazards come from a seeded generator that
  puts about 60% of them on the usual fastest route. A hard block makes "the route avoids it" true by construction, so the
  report gives the usual route's exposure and the cost of avoiding it, never an avoidance rate, and every figure is
  "Simulated scenarios on real roads; modelled minutes".
- **The Andheri Subway is an assumption.** OSM leaves the road under the Andheri railway line unnamed and unmarked, so
  `flood-prone.json` names it and marks it flood-prone by hand. Confirm against a municipal flood-prone-spot list before any live
  use.
- **Data gaps count per stretch.** The data-gap penalty applies once per continuous flood-prone stretch of a route (any recent
  report on it covers the stretch), because real roads are split into many short edges.

- **Rain alerts and hospital state are not live inputs yet.** The CAP parser (docs/TASKS.md P2-5.a) was tested only against a
  hand-written fixture, and hospital load spreading (P2-4.b) exists in the engine without an operator control or a screen.

## Languages

- **Hindi and Marathi translations need review by a native speaker** before any public use. They
  were written without one. Engine-generated sentences (route reasons, change messages, counterfactuals,
  coverage lines) are built as structured text and shown in the active language; place and road names stay as
  OpenStreetMap gives them.

## Platform

- Android first; iOS is Stretch and untested.
- Nothing in this repository has run on a physical phone yet (see docs/TASKS.md).
- Report photos have no retention or deletion job, no operator "delete photo" action, no face or number-plate blurring and no virus or content scan beyond a JPEG sanity check. They are operator-only, but they are stored in Postgres until the table is cleared. Decide a retention rule before real use.
