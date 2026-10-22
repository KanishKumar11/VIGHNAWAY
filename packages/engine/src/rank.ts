import type { Incident, RouteRole } from '@vighnaway/contracts';
import type { Evaluated } from './evaluate';
import { SCORING_RULES } from './rules';

/** Deterministic order: lower cost, then shorter distance, then smaller route id. */
export function compareEvaluations(a: Evaluated, b: Evaluated): number {
  if (a.costS !== b.costS) return a.costS - b.costS;
  if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
  return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
}

/** True when `gainS` (integer seconds) is strictly more than the switching threshold. */
export function exceedsSwitchThreshold(currentCostS: number, gainS: number): boolean {
  const { minGainS } = SCORING_RULES.switching.value;
  // gain > max(120, 10% of cost), in integer arithmetic so 10% never rounds the wrong way.
  return gainS > minGainS && gainS * 10 > currentCostS;
}

export function switchThresholdS(currentCostS: number): number {
  return Math.max(SCORING_RULES.switching.value.minGainS, currentCostS * SCORING_RULES.switching.value.minGainFraction);
}

export interface RankDecision {
  kind: 'initial' | 'kept' | 'invalid' | 'outperformed' | 'no_viable_route';
  previousRouteId: string | null;
  gainS: number | null;
  /** Incident that triggered the change (newest relevant incident on the previous route). */
  trigger: Incident | null;
}

export interface RankResult {
  /** All evaluations in deterministic rank order (viable first). */
  ordered: Evaluated[];
  recommendedRouteId: string | null;
  roles: Map<string, RouteRole>;
  decision: RankDecision;
}

function newestIncident(ids: readonly string[], incidents: ReadonlyMap<string, Incident>): Incident | null {
  let best: Incident | null = null;
  for (const id of ids) {
    const inc = incidents.get(id);
    if (!inc) continue;
    if (!best || inc.seq > best.seq || (inc.seq === best.seq && inc.id < best.id)) best = inc;
  }
  return best;
}

/**
 * Applies the switching rule and assigns roles.
 * 1. A previous recommendation that is no longer viable is replaced by the best viable route.
 * 2. Otherwise it is kept unless another viable route is cheaper by more than the threshold.
 * 3. Ties: cost, distance, route id. Unchanged inputs always give the same answer.
 */
export function rank(
  evaluations: readonly Evaluated[],
  previousRecommendationId: string | null,
  options: { usualFastestRouteId?: string | null; incidents?: ReadonlyMap<string, Incident> } = {},
): RankResult {
  const incidents = options.incidents ?? new Map<string, Incident>();
  const viable = evaluations.filter((e) => e.viable).sort(compareEvaluations);
  const blocked = evaluations.filter((e) => !e.viable).sort(compareEvaluations);
  const ordered = [...viable, ...blocked];
  const best = viable[0] ?? null;
  const previous = previousRecommendationId
    ? evaluations.find((e) => e.routeId === previousRecommendationId) ?? null
    : null;

  let recommended: Evaluated | null = best;
  let decision: RankDecision = { kind: 'initial', previousRouteId: null, gainS: null, trigger: null };

  if (previous) {
    if (!previous.viable) {
      decision = {
        kind: best ? 'invalid' : 'no_viable_route',
        previousRouteId: previous.routeId,
        gainS: null,
        trigger: newestIncident(previous.blockedBy.map((b) => b.incidentId), incidents),
      };
    } else if (best && best.routeId !== previous.routeId) {
      const gainS = previous.costS - best.costS;
      if (exceedsSwitchThreshold(previous.costS, gainS)) {
        decision = {
          kind: 'outperformed',
          previousRouteId: previous.routeId,
          gainS,
          trigger: newestIncident(
            previous.hazards.filter((h) => h.effect !== 'none').map((h) => h.incidentId),
            incidents,
          ),
        };
      } else {
        recommended = previous;
        decision = { kind: 'kept', previousRouteId: previous.routeId, gainS, trigger: null };
      }
    } else {
      recommended = previous;
      decision = { kind: 'kept', previousRouteId: previous.routeId, gainS: 0, trigger: null };
    }
  } else if (!best) {
    decision = { kind: 'no_viable_route', previousRouteId: null, gainS: null, trigger: null };
  }

  const roles = new Map<string, RouteRole>();
  for (const e of ordered) {
    if (!e.viable) roles.set(e.routeId, 'blocked');
    else if (recommended && e.routeId === recommended.routeId) roles.set(e.routeId, 'recommended');
    else if (options.usualFastestRouteId && e.routeId === options.usualFastestRouteId) roles.set(e.routeId, 'usual_fastest');
    else roles.set(e.routeId, 'alternative');
  }

  return { ordered, recommendedRouteId: recommended?.routeId ?? null, roles, decision };
}
