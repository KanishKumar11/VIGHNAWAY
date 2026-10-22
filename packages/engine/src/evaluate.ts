import type {
  Crossing,
  CrossingKind,
  DataGap,
  Incident,
  RouteEvaluation,
  RouteHazard,
} from '@vighnaway/contracts';
import type { GEdge, Graph } from './graph';
import type { EvalContext, IncidentEffect, IncidentIndex } from './incidents';
import { ageFactor, incidentEffect, isHard } from './incidents';
import { SCORING_RULES } from './rules';
import { crossingNameText, routeNameText, tx } from './text/build';
import { renderText } from './text/render';

/** A route evaluated against incidents, before ranking assigns a role and explanation. */
export type Evaluated = Omit<RouteEvaluation, 'role' | 'explanation'>;

const FOOT_HIGHWAYS = new Set(['footway', 'steps', 'path', 'pedestrian']);

export function crossingKind(e: GEdge): CrossingKind | null {
  if (e.tunnel || (e.layer < 0 && !e.bridge)) return 'underpass';
  if (!e.bridge) return null;
  if (FOOT_HIGHWAYS.has(e.highway)) return 'footbridge';
  return e.layer >= 1 ? 'flyover' : 'bridge';
}

/**
 * Open incidents on a profile edge, looked up by its graph.json id. Incidents list every directed
 * edge they affect (the API adds both directions of a two-way road), so no twin lookup is needed.
 */
function incidentsOnEdge(e: GEdge, index: IncidentIndex): Incident[] {
  return index.openByEdge.get(e.baseId) ?? [];
}

function edgeCovered(graph: Graph, e: GEdge, index: IncidentIndex, ctx: EvalContext): boolean {
  const windowS = SCORING_RULES.dataGap.value.windowS;
  const ids = [e.baseId];
  if (e.reverseIdx >= 0) ids.push(graph.edges[e.reverseIdx]!.baseId);
  for (const id of ids) {
    const t = index.lastReportByEdge.get(id);
    if (t !== undefined && ctx.nowS - t <= windowS) return true;
  }
  return false;
}

/**
 * Evaluates one route (profile edge indices in travel order) against the incident set:
 * viability, displayed ETA, ranking cost, hazards and data gaps. Pure and deterministic.
 */
export function evaluate(
  graph: Graph,
  edgeIdx: readonly number[],
  index: IncidentIndex,
  ctx: EvalContext,
): Evaluated {
  const effects = new Map<string, IncidentEffect>();
  const firstSeen = new Map<string, { edge: GEdge; positionM: number }>();
  const congestionTime = new Map<string, number>();
  let timeS = 0;
  let positionM = 0;
  let floodProneEdgeCount = 0;
  let stepFreeUnknownCount = 0;
  // "Prefer well-lit roads" (P2-9): ranking only, walking only, and only when the traveller turned it on.
  const lighting = ctx.lighting;
  let unlitCount = 0;
  let lightingUnknownCount = 0;
  let unlitExtraS = 0;
  const concernPenalty = new Map<string, number>();
  const concernsByEdge = new Map<string, NonNullable<typeof lighting>['concerns']>();
  for (const c of lighting?.concerns ?? []) {
    for (const edgeId of c.edgeIds) {
      const list = concernsByEdge.get(edgeId);
      if (list) list.push(c);
      else concernsByEdge.set(edgeId, [c]);
    }
  }
  const stepFreeUnknown: readonly string[] | null = graph.profile === 'step_free' ? SCORING_RULES.stepFree.value.unknownHighways : null;
  const dataGaps: DataGap[] = [];
  let gapRun: { covered: boolean; gap: DataGap | null } | null = null;
  const crossings: Crossing[] = [];
  const roadLength = new Map<string, number>();
  const roadOrder: string[] = [];

  for (const ei of edgeIdx) {
    const e = graph.edges[ei]!;
    if (stepFreeUnknown?.includes(e.highway)) stepFreeUnknownCount++;
    if (lighting) {
      const rule = SCORING_RULES.preferLit.value;
      if (e.lit === false) {
        unlitCount++;
        unlitExtraS += rule.unlitExtraShare * e.timeS;
      } else if (e.lit === null) {
        lightingUnknownCount++;
      }
      for (const c of concernsByEdge.get(e.baseId) ?? []) {
        if (concernPenalty.has(c.id)) continue;
        const weight = SCORING_RULES.verificationWeight.value[c.status as 'unverified' | 'corroborated' | 'verified'] ?? 0;
        concernPenalty.set(c.id, rule.concernPenaltyS * weight * ageFactor(Math.max(0, ctx.nowS - c.lastReportAtS)));
      }
    }
    let multiplier = 1;
    for (const inc of incidentsOnEdge(e, index)) {
      let eff = effects.get(inc.id);
      if (!eff) {
        eff = incidentEffect(inc, ctx);
        effects.set(inc.id, eff);
        firstSeen.set(inc.id, { edge: e, positionM });
      }
      if (eff.kind === 'congestion') multiplier = Math.max(multiplier, eff.multiplier);
      if (eff.kind === 'congestion' || eff.unverifiedCongestionShare > 0) {
        congestionTime.set(inc.id, (congestionTime.get(inc.id) ?? 0) + e.timeS);
      }
    }
    timeS += e.timeS * multiplier;

    if (e.floodProne) {
      floodProneEdgeCount++;
      if (ctx.rainAlertActive) {
        // One gap per continuous stretch: real roads are split into many short edges, and a stretch
        // counts as covered when any of its edges has a recent report.
        if (!gapRun) gapRun = { covered: false, gap: null };
        if (!gapRun.covered) {
          if (edgeCovered(graph, e, index, ctx)) {
            gapRun.covered = true;
            if (gapRun.gap) dataGaps.splice(dataGaps.indexOf(gapRun.gap), 1);
            gapRun.gap = null;
          } else if (!gapRun.gap) {
            gapRun.gap = {
              edgeId: e.id,
              roadName: e.name,
              positionM: Math.round(positionM),
              penaltyS: SCORING_RULES.dataGap.value.penaltyS,
            };
            dataGaps.push(gapRun.gap);
          }
        }
      }
    } else {
      gapRun = null;
    }

    const kind = crossingKind(e);
    if (kind) {
      const last = crossings[crossings.length - 1];
      const name = e.name ?? renderText(tx(`crossing.unnamed.${kind}`), 'en');
      if (last && last.kind === kind && last.name === name && last.positionM + last.lengthM >= Math.round(positionM) - 1) {
        last.lengthM = Math.round(positionM + e.lengthM) - last.positionM;
      } else {
        crossings.push({ name, kind, positionM: Math.round(positionM), lengthM: Math.round(e.lengthM) });
      }
    }

    if (e.name) {
      if (!roadLength.has(e.name)) roadOrder.push(e.name);
      roadLength.set(e.name, (roadLength.get(e.name) ?? 0) + e.lengthM);
    }
    positionM += e.lengthM;
  }

  const hazards: RouteHazard[] = [];
  const blockedBy: Evaluated['blockedBy'] = [];
  let penaltySum = 0;
  let usesStaleBlock = false;
  const ids = [...effects.keys()].sort();
  for (const id of ids) {
    const inc = index.byId.get(id)!;
    const eff = effects.get(id)!;
    const seen = firstSeen.get(id)!;
    let penaltyS = 0;
    let addedEtaS = 0;
    if (eff.kind === 'congestion') {
      addedEtaS = Math.round((congestionTime.get(id) ?? 0) * (eff.multiplier - 1));
    } else if (eff.unverifiedCongestionShare > 0) {
      penaltyS = Math.round((congestionTime.get(id) ?? 0) * eff.unverifiedCongestionShare);
    } else {
      penaltyS = Math.round(eff.penaltyS);
    }
    if (eff.kind === 'block') {
      blockedBy.push({ incidentId: id, edgeId: seen.edge.id, reason: eff.reason });
      if (eff.stale) usesStaleBlock = true;
    }
    penaltySum += penaltyS;
    hazards.push({
      incidentId: id,
      type: inc.type,
      status: inc.status,
      source: inc.source,
      effect: eff.kind,
      penaltyS,
      addedEtaS,
      firstEdgeId: seen.edge.id,
      roadName: inc.roadName ?? seen.edge.name,
      positionM: Math.round(seen.positionM),
      ageS: Math.round(eff.ageS),
      stale: eff.stale,
      conflicting: inc.conflicting,
    });
  }
  hazards.sort((a, b) => a.positionM - b.positionM || (a.incidentId < b.incidentId ? -1 : a.incidentId > b.incidentId ? 1 : 0));
  blockedBy.sort((a, b) => (a.incidentId < b.incidentId ? -1 : a.incidentId > b.incidentId ? 1 : 0));

  const etaS = Math.round(timeS);
  const gapS = dataGaps.reduce((s, g) => s + g.penaltyS, 0);
  const lightingS = lighting ? Math.round(unlitExtraS + [...concernPenalty.values()].reduce((a, b) => a + b, 0)) : 0;
  const costS = etaS + penaltySum + gapS + lightingS;

  const roadNames = [...roadOrder].sort(
    (a, b) => (roadLength.get(b)! - roadLength.get(a)!) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const firstCrossing = crossings.find((c) => c.kind !== 'bridge') ?? crossings[0];
  const nameText = routeNameText(firstCrossing ? crossingNameText(firstCrossing) : roadNames[0] || null);
  const name = renderText(nameText, 'en');

  const edgeIds = edgeIdx.map((ei) => graph.edges[ei]!.id);
  const nodeIds: string[] = [];
  if (edgeIdx.length) {
    nodeIds.push(graph.nodeIds[graph.edges[edgeIdx[0]!]!.from]!);
    for (const ei of edgeIdx) nodeIds.push(graph.nodeIds[graph.edges[ei]!.to]!);
  }

  return {
    routeId: edgeIds.join('|'),
    name,
    nameText,
    edgeIds,
    nodeIds,
    distanceM: Math.round(positionM),
    etaS,
    costS,
    viable: blockedBy.length === 0,
    blockedBy,
    hazards,
    dataGaps,
    floodProneEdgeCount,
    crossings,
    roadNames: roadNames.slice(0, 4),
    usesStaleBlock,
    ...(stepFreeUnknown ? { stepFreeUnknownCount } : {}),
    ...(lighting ? { lighting: { unlitCount, unknownCount: lightingUnknownCount, concernIds: [...concernPenalty.keys()].sort() } } : {}),
  };
}

/** True when an incident on this evaluation is unverified and still open. */
export const hasUnverifiedHazard = (ev: Evaluated): boolean =>
  ev.hazards.some((h) => h.status === 'unverified' && h.effect !== 'none');

export const hasConflictingHazard = (ev: Evaluated): boolean =>
  ev.hazards.some((h) => h.conflicting && h.effect !== 'none');

export const hasStaleHazard = (ev: Evaluated): boolean => ev.hazards.some((h) => h.stale && h.effect !== 'none');

export { isHard };
