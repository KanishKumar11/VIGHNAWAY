import { SCORING_RULES, scoringRulesTable } from '../src';

const speeds = SCORING_RULES.speedsKmh.value;

/** Markdown for docs/scoring.md, rendered from SCORING_RULES. */
export function renderScoringDoc(): string {
  const rows = scoringRulesTable()
    .filter((r) => r.key !== 'speedsKmh')
    .map((r) => `| \`${r.key}\` | ${r.value.replace(/\|/g, '\\|')} | ${r.description.replace(/\|/g, '\\|')} |`);
  const classes = [...new Set([...Object.keys(speeds.car), ...Object.keys(speeds.two_wheeler)])];
  const speedRows = classes.map(
    (c) => `| ${c} | ${speeds.car[c as keyof typeof speeds.car] ?? '-'} | ${speeds.two_wheeler[c as keyof typeof speeds.two_wheeler] ?? '-'} | ${c === 'steps' ? speeds.foot.steps : speeds.foot.default} |`,
  );
  return `<!-- GENERATED from packages/engine/src/rules.ts by \`pnpm docs:scoring\`. Do not edit by hand. -->
# Scoring rules (engine v${SCORING_RULES.version})

VIGHNAWAY ranks candidate routes with a deterministic cost. The phone and the console run the same
engine on the same inputs, so they reach the same recommendation independently. No LLM, randomness
or hosted router is involved.

**Formula.** ${SCORING_RULES.formula}

    C(r) = Σ_e t_e·m_e + Σ_{i∈H(r)} P(s_i)·w(v_i)·f(a_i) + U(r)

- The **displayed ETA** is the sum of edge travel times with verified or corroborated congestion
  only. The **ranking cost** adds every penalty on top. Ranking cost is never shown as time; the UI
  explains penalties in words ("avoids an unconfirmed flood report").
- Costs and ETAs are rounded to whole seconds before any comparison.

## Constants

| Rule | Value | Meaning |
| --- | --- | --- |
${rows.join('\n')}

## Incident effects (authoritative)

| Incident type | Reported condition | Status | Effect |
| --- | --- | --- | --- |
| Flood | Ankle | Any open status | Severity medium: 300 s × w × f ranking penalty; route stays viable |
| Flood | Knee or waist | Verified or corroborated | Hard block |
| Flood | Knee or waist | Unverified | +1,800 s ranking penalty and a visible warning; route stays viable |
| Flood | Depth not given | Any open status | Treated as knee depth (conservative) |
| Closure | Any | Verified or corroborated | Hard block |
| Closure | Any | Unverified | +1,800 s ranking penalty and a visible warning |
| Congestion | Moderate, heavy, standstill | Verified or corroborated | Multiplies edge travel time (1.5, 2.5, 4.0), so the displayed ETA changes |
| Congestion | Moderate, heavy, standstill | Unverified | Ranking penalty equal to the extra time it would add × 0.4; the displayed ETA does not change |
| Debris or accident | Low, medium, high | Any open status | 60, 300 or 900 s × w × f ranking penalty; hard block only if reported impassable and verified or corroborated (unverified impassable: +1,800 s and a warning) |
| Road clear | Not applicable | Not applicable | Never resolves an incident by itself; marks it Conflicting (route confidence Low) until an operator resolves it or clear reports arrive from two different devices. The incident's routing effect stays in force while Conflicting |
| Any | Not applicable | Resolved or dismissed | No effect; kept in history |

Notes:

- Penalties apply once per incident on a route, whatever the number of its edges it crosses.
  Congestion applies per affected edge.
- **Stale:** a report strictly older than 3 simulated hours is labelled Stale and keeps age factor
  0.6. A report exactly 3 h old is not yet Stale. Hard blocks from stale reports stay in force until
  an operator resolves them, and confidence drops to Low.
- **Data gap:** only while a rain alert is active, only on flood-prone edges, only when no incident
  (of any status) covering that edge has a report in the last 60 simulated minutes. A report
  exactly 60 min old still counts. Ranking only; shown as "No recent reports on <road>". Without
  any alert information no data-gap penalty applies and the note reads "No rain alert information".

## Switching precedence

1. If the selected route crosses a hard constraint on any edge not yet travelled, it is invalid
   immediately, whatever the threshold; the best viable route is chosen.
2. Otherwise it is kept unless another viable route's ranking cost is lower by more than the
   larger of 120 s and 10% of the current cost. A gain exactly equal to the threshold does not
   switch (computed in integers: \`gain > 120 && gain × 10 > cost\`).
3. Remaining ties: lower cost, then shorter distance, then the lexicographically smaller route id
   (edge ids joined with "|").
4. Evaluation is idempotent: unchanged inputs never change the recommendation.
5. Every change records the triggering incident (id, type, status, source), why the previous route
   lost (invalid, or outperformed and by how much) and the trade-off of the new one.

## Confidence (a label, never a probability)

Check Low first, then Medium; otherwise High.

| Confidence | Applies when |
| --- | --- |
| Low | A conflicting incident on the route; viability relies on a stale report; the next viable route is within 60 s of ranking cost; or the plan is a forced reversal |
| Medium | An unverified incident on the route; a data gap on the route; alert information missing while the route uses flood-prone edges; or the next viable route is within 60 to 180 s |
| High | None of the above, including routes with no incidents and no flood-prone edges, or when no other viable route exists |

"Next viable route" means the other routes shown to the user (after the 80% overlap filter and one
route per crossing), so near-identical variants of the same road do not force Low confidence.

## Re-planning en route

\`replanFrom\` snaps the vehicle to its current edge and plans from that edge's end node. Turning back
onto the reverse of the current edge is banned while any forward plan is viable. Only when none is
may it return a reversal, labelled "${SCORING_RULES.reversal.value}", with confidence Low. A lower
modelled cost never makes a reversal acceptable. If the vehicle is already on a newly blocked edge,
the plan is shown from the next junction ahead with a prominent warning.

## Candidates

Yen's k-shortest paths (k = 5, at most 60 searches) on free-flow time, plus edge-penalty
alternatives (4 rounds, ×1.6), plus the best path around current hazards (and 2 penalty rounds on
it), plus the route currently being followed. Searches are goal-directed (A*) with a straight-line
bound computed using only arithmetic and \`sqrt\`, so Hermes and browsers explore identically.

## Speeds (km/h, illustrative monsoon-traffic defaults, not measurements)

| Road class | Car | Two-wheeler | On foot |
| --- | --- | --- | --- |
${speedRows.join('\n')}
| other | ${SCORING_RULES.defaultSpeedKmh.value.car} | ${SCORING_RULES.defaultSpeedKmh.value.two_wheeler} | ${speeds.foot.default} |

## Access per profile

${SCORING_RULES.access.description}

## Test cases

The Vitest suite in \`packages/engine/test\` covers: normal trip; verified closure on the fastest
route; unverified flood below the switching threshold; a new incident blocking the selected route;
no viable alternative; reachable destination; profile change; stale labelling; replay snapshot;
monotonicity properties (more severe or more verified never lowers cost; a change below the
threshold never flips); and the boundary cases (threshold ±1 s, rounding ties, tie-break order,
exactly 3 h, exactly 60 min, depth not given, unverified congestion ETA, Road clear → Conflicting,
reversal only without a forward plan, idempotence).
`;
}
