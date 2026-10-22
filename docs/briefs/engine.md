# Brief: Engine
Read in docs/BUILD_PROMPT.md: sections 1, 4 (all, including Scoring definitions, Determinism and Re-planning en route) and 10 (event script, testing). Also docs/scoring.md.
Scope: packages/engine only. Pure TypeScript: no React, no React Native, no Node built-ins, never read the clock.

Deliver, in order:
1. loadGraph with profile access and speeds; snapToNode.
2. dijkstra (binary heap) and yenKShortest (k = 5) with the 80% overlap filter.
3. evaluate; rank with the switching rule and deterministic tie-breaks (cost, distance, route id; values rounded to whole seconds); explain (reason, trade-off, re-check-if, confidence label).
4. planTrip and replanFrom (never backwards; a reversal only when no forward plan is viable, per the Reversal rule).
5. findReachableDestination.
6. SCORING_RULES export and a planTrip output hash for the phone and console parity check.

Acceptance: every test in section 4 passes; planTrip under 200 ms on the Andheri graph (measured); identical output across repeated runs.
Hand-offs: Mobile and Console use only the exported functions; announce any signature change before making it.
Do not: add native dependencies, read Date.now(), or change a constant without updating docs/scoring.md.
