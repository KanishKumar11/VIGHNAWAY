<!-- GENERATED from packages/engine/src/rules.ts by `pnpm docs:scoring`. Do not edit by hand. -->
# Scoring rules (engine v1)

VIGHNAWAY ranks candidate routes with a deterministic cost. The phone and the console run the same
engine on the same inputs, so they reach the same recommendation independently. No LLM, randomness
or hosted router is involved.

**Formula.** C(r) = sum over edges of (travel time x congestion multiplier) + sum over incidents on the route of (severity penalty x verification weight x age factor) + data-gap penalty

    C(r) = Σ_e t_e·m_e + Σ_{i∈H(r)} P(s_i)·w(v_i)·f(a_i) + U(r)

- The **displayed ETA** is the sum of edge travel times with verified or corroborated congestion
  only. The **ranking cost** adds every penalty on top. Ranking cost is never shown as time; the UI
  explains penalties in words ("avoids an unconfirmed flood report").
- Costs and ETAs are rounded to whole seconds before any comparison.

## Constants

| Rule | Value | Meaning |
| --- | --- | --- |
| `congestionMultiplier` | heavy: 2.5; moderate: 1.5; none: 1; standstill: 4 | Verified or corroborated congestion multiplies edge travel time, so the displayed ETA changes. |
| `unverifiedCongestionWeight` | 0.4 | Unverified congestion adds a ranking penalty equal to the extra time it would add x 0.4. The displayed ETA does not change. |
| `severityPenaltyS` | high: 900; low: 60; medium: 300 | Ranking-only seconds for debris and accidents (and medium for ankle-deep water). Never shown as time. |
| `defaultSeverity` | medium | Severity assumed when a debris or accident report gives none. |
| `verificationWeight` | corroborated: 0.75; dismissed: 0; resolved: 0; unverified: 0.4; verified: 1 | Scales the severity penalty by how well the incident is supported. |
| `ageFactor` | floor: 0.6; floorAtS: 10800; fullUntilS: 1800 | Penalty weight is 1.0 for reports under 30 min old, falling linearly to 0.6 at 3 h, and 0.6 after that. Older reports are labelled Stale, never dropped. |
| `staleAfterS` | 10800 | A report older than 3 simulated hours (strictly more than 10,800 s) is labelled Stale. Hard blocks from stale reports stay in force until an operator resolves them, and confidence drops to Low. |
| `unverifiedBlockPenaltyS` | 1800 | An unverified closure, unverified knee-or-deeper flood, or unverified impassable report adds 1,800 s to ranking and a visible warning; the route stays viable. |
| `ankleFloodSeverity` | medium | Ankle-deep water is a medium-severity penalty (300 s x weight x age) for every open status; the route stays viable. |
| `defaultFloodDepth` | knee | A flood report with no depth is treated as knee depth (conservative). |
| `dataGap` | penaltyS: 120; windowS: 3600 | While a rain alert is active, each continuous stretch of flood-prone edges with no report on any of its edges in the last 60 simulated minutes adds 120 s to ranking only. A report exactly 60 min old still counts as recent. It never creates an incident and is shown as "No recent reports on <road>". |
| `switching` | minGainFraction: 0.1; minGainS: 120 | Keep the current recommendation unless it is not viable, or another viable route is cheaper by more than the larger of 120 s and 10% of the current cost. A gain exactly equal to the threshold does not switch. |
| `tieBreak` | cost, distance, routeId | Ties are broken by lower cost, then shorter distance, then the lexicographically smaller route id. Costs and ETAs are rounded to whole seconds before comparing. |
| `confidence` | lowGapS: 60; mediumGapS: 180 | Low: a conflicting incident on the route, viability relying on a stale report, the next viable route within 60 s of ranking cost, or a forced reversal. Medium: an unverified incident on the route, a data gap on the route, no alert information while the route uses flood-prone edges, or the next viable route within 60 to 180 s. High otherwise, including when no other viable route exists. |
| `candidates` | k: 5; maxDisplayed: 4; overlapLimit: 0.8; penaltyFactor: 1.6; penaltyRounds: 4 | Candidates come from Yen k-shortest paths (k = 5) plus edge-penalty alternatives and the best path around current hazards. A candidate sharing more than 80% of its length with a better one is dropped, and so is one whose title is the same as a route already shown. Up to 4 routes are shown. |
| `reversal` | Turn back only where it is safe to do so | Re-planning never turns back onto the current edge while any forward plan is viable. Only when none is viable may it return a reversal, with this label and confidence Low. |
| `defaultSpeedKmh` | car: 15; foot: 4.5; two_wheeler: 18 | Speed for road classes not listed above. |
| `hospitalLoad` | busyS: 300; divertingS: 1800; perAssignedS: 120 | When several trips head for the nearest hospital, each hospital costs its arrival time plus a state penalty (accepting 0, busy 300 s, diverting 1,800 s) plus 120 s for each trip already assigned to it in the same batch. The lowest cost wins and ties go to the lower hospital id. Ranking only: the arrival time shown is unchanged. A hospital that is not reachable is never assigned. |
| `access` | footExcludedHighways: motorway, motorway_link; motorExcludedHighways: footway, path, pedestrian, steps, cycleway, bridleway, corridor, platform, elevator | Car and two-wheeler exclude footways, paths, pedestrian streets, steps and motor_vehicle=no. On foot excludes foot=no and motorways, includes footways, footbridges and steps, and may walk one-way streets in both directions. access=no or private excludes every profile unless the profile tag says yes. |

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
   switch (computed in integers: `gain > 120 && gain × 10 > cost`).
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

`replanFrom` snaps the vehicle to its current edge and plans from that edge's end node. Turning back
onto the reverse of the current edge is banned while any forward plan is viable. Only when none is
may it return a reversal, labelled "Turn back only where it is safe to do so", with confidence Low. A lower
modelled cost never makes a reversal acceptable. If the vehicle is already on a newly blocked edge,
the plan is shown from the next junction ahead with a prominent warning.

## How counterfactuals are computed ("Why not that route?")

Every shown route that is not recommended carries a `counterfactual`: the smallest change that would
make it the recommendation. Nothing is estimated. Each claim is checked by re-ranking all candidate
routes with the same rules (including the switching rule above), so it can never disagree with the
decision. "Cleared" means the incident is resolved: it stops counting as a hazard but still counts as
a recent report for the data-gap rule.

- **blocked**: the route is not viable while its blocking incidents stand. A faster ETA never makes
  it recommended. `wouldBeRecommended` says whether clearing all of them would.
- **hazards**: clearing one active hazard flips the ranking (hazards tried one at a time in incident
  id order; that single hazard is the smallest change), else clearing all of them together does
  ("if these were cleared": no claim of minimality).
- **time**: the smallest whole-second cut in the route's ranking cost that makes it the
  recommendation, found by search over the same ranking, so it already includes the threshold
  (gain > 120 s and gain x 10 > current cost when a route is being followed). Shown rounded
  up to whole minutes, as "if it were N min faster".
- **none_sufficient**: clearing its hazards, or saving any time, would not make it recommended.

The explanation is part of the plan hash (`counterfactual`); only its text rendering is not.

## Candidates

Yen's k-shortest paths (k = 5, at most 60 searches) on free-flow time, plus edge-penalty
alternatives (4 rounds, ×1.6), plus the best path around current hazards (and 2 penalty rounds on
it), plus the route currently being followed. Searches are goal-directed (A*) with a straight-line
bound computed using only arithmetic and `sqrt`, so Hermes and browsers explore identically.

## Speeds (km/h, illustrative monsoon-traffic defaults, not measurements)

| Road class | Car | Two-wheeler | On foot |
| --- | --- | --- | --- |
| motorway | 50 | 50 | 4.5 |
| motorway_link | 35 | 35 | 4.5 |
| trunk | 40 | 40 | 4.5 |
| trunk_link | 30 | 32 | 4.5 |
| primary | 30 | 32 | 4.5 |
| primary_link | 25 | 27 | 4.5 |
| secondary | 25 | 27 | 4.5 |
| secondary_link | 20 | 22 | 4.5 |
| tertiary | 20 | 22 | 4.5 |
| tertiary_link | 18 | 20 | 4.5 |
| unclassified | 15 | 18 | 4.5 |
| residential | 15 | 18 | 4.5 |
| living_street | 10 | 12 | 4.5 |
| service | 10 | 12 | 4.5 |
| road | 15 | 18 | 4.5 |
| other | 15 | 18 | 4.5 |

## Access per profile

Car and two-wheeler exclude footways, paths, pedestrian streets, steps and motor_vehicle=no. On foot excludes foot=no and motorways, includes footways, footbridges and steps, and may walk one-way streets in both directions. access=no or private excludes every profile unless the profile tag says yes.

## Test cases

The Vitest suite in `packages/engine/test` covers: normal trip; verified closure on the fastest
route; unverified flood below the switching threshold; a new incident blocking the selected route;
no viable alternative; reachable destination; profile change; stale labelling; replay snapshot;
monotonicity properties (more severe or more verified never lowers cost; a change below the
threshold never flips); and the boundary cases (threshold ±1 s, rounding ties, tie-break order,
exactly 3 h, exactly 60 min, depth not given, unverified congestion ETA, Road clear → Conflicting,
reversal only without a forward plan, idempotence).
