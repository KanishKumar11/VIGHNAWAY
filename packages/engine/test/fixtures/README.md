# Engine test fixtures

`andheri-graph.json` and `andheri-scenario.json` are a frozen copy of the schematic Andheri fixture
(the `Init` commit of packages/scenario-data/andheri). The engine tests assert exact routes,
names and times on it, so it must not change when the demo scenario is re-tuned on the real OSM
graph. Update these files only to change what the engine tests assert, and say so in the commit.
