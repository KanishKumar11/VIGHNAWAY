# Known limitations

Shown (summarised) on the app's How it decides screen and the console's /rules page.

## Data

- **Simulated conditions in the demo.** Every flood, closure and congestion in the simulated demo
  scenario is simulated. In live mode, incidents come from real user reports, operators and the
  TomTom feed, each labelled with its source; VIGHNAWAY never says a real road is flooded or closed
  unless a named source reported it.
- **Schematic road fixture.** The committed `graph.json` is a hand-drawn schematic of Andheri
  (real road names, approximate positions), because the build sandbox could not reach
  OpenStreetMap. Routes will not line up exactly with the Google basemap until
  `scripts/extract_graph.py` is run and the scenario re-tuned. The UI shows the fixture notice
  instead of the OpenStreetMap attribution while the fixture is in use.
- **Speeds are illustrative** monsoon-traffic defaults per road class, not measurements.
- **Overlaying OSM-derived routes on Google Maps:** the team must confirm this fits both
  providers' terms before any public release.

## Evidence

- **Corroboration by device is a heuristic.** Two device ids within 150 m and 30 minutes count as
  "Corroborated (2 devices)". Device ids are random and self-reported; one person with two phones
  can corroborate. It is not proof of independent witnesses. Only an operator sets Verified.
- **Operator access is demo-grade.** A shared bearer token typed into the console and kept in
  sessionStorage.
- **Road clear reports** without an open incident nearby are recorded but do not count as
  coverage for the data-gap rule.
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

## Languages

- **Hindi and Marathi translations need review by a native speaker** before any public use. They
  were written without one. Engine-generated sentences (route reasons, change messages) are
  currently English in every language.

## Platform

- Android first; iOS is Stretch and untested.
- Nothing in this repository has run on a physical phone yet (see docs/TASKS.md).
