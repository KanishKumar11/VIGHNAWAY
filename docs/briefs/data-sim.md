# Brief: Data and simulation
Read in docs/BUILD_PROMPT.md: sections 1, 3, 4 (Road graph preparation), 5 (Simulation runner, Simulation clock) and 10 (scenario, event script). Also docs/demo-script.md.
Scope: scripts/extract_graph.py, packages/scenario-data, and apps/api/src/sim together with the API owner.

Deliver, in order:
1. Graph extract for the Andheri box following the nine steps in section 4: graph.json with graph_version, flood-prone.json, PostGIS seed generated from the same file.
2. Verification: the graph drawn over the Google basemap at the three crossings (fix drift); connectivity report for every profile.
3. scenario.json: origin, destination, alternative hospital, rain alert, events with atS; no incidents at start.
4. Tune fixtures and vehicle speed: A beats B and B beats C by 4 to 6 minutes each; the vehicle is before the underpass at 14:10 and before the flyover ramp at 14:15.
5. Simulation runner: play, pause, step, reset, sim.tick at the fixed speed-up; ids and timestamps derived from scenario, step and simulation time.

Acceptance: reset then replay twice gives identical event logs and engine outputs; the full script runs in about 90 seconds.
Do not: hand-edit graph.json; change the script and regenerate.
