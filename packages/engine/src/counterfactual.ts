import type { Counterfactual, Incident, Text } from '@vighnaway/contracts';
import type { Evaluated } from './evaluate';
import { evaluate } from './evaluate';
import type { Graph } from './graph';
import type { EvalContext, IncidentIndex } from './incidents';
import { buildIncidentIndex } from './incidents';
import { rank } from './rank';
import { hazardPhraseText, tx } from './text/build';

/**
 * "Why not that route?" For a route that is not recommended, finds the smallest change that would
 * make it the recommendation. Nothing here is estimated: every claim is checked by re-ranking all
 * the candidate routes with the same rules (rank), so the answer follows the switching threshold
 * (`gain > 120 s and gain x 10 > cost`) without restating it.
 *
 * "Cleared" means the incident is resolved: it stops counting as a hazard but still counts as a
 * recent report for the data-gap rule. Deterministic: incident ids are tried in id order.
 */

export interface CounterfactualInput {
  graph: Graph;
  /** Every candidate route evaluated for this trip (the same set rank() saw). */
  candidates: readonly Evaluated[];
  recommendedRouteId: string;
  index: IncidentIndex;
  ctx: EvalContext;
  previousKey: string | null;
  usualFastestRouteId: string | null;
  /** Routes to explain. */
  targets: readonly Evaluated[];
}

export interface CounterfactualResult {
  counterfactual: Counterfactual;
  text: Text;
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

export function counterfactuals(input: CounterfactualInput): Map<string, CounterfactualResult> {
  const { graph, candidates, index, ctx, previousKey, usualFastestRouteId } = input;
  const out = new Map<string, CounterfactualResult>();

  const winner = (evals: readonly Evaluated[]): string | null =>
    rank(evals, previousKey, { usualFastestRouteId, incidents: index.byId }).recommendedRouteId;

  // The decision must reproduce before it can be explained.
  if (winner(candidates) !== input.recommendedRouteId) return out;

  const reevaluated = new Map<string, Evaluated[]>();
  const withCleared = (cleared: readonly string[]): Evaluated[] => {
    const key = unique(cleared).join('|');
    const hit = reevaluated.get(key);
    if (hit) return hit;
    const set = new Set(cleared);
    const idx = buildIncidentIndex(index.sorted.map((i): Incident => (set.has(i.id) ? { ...i, status: 'resolved' } : i)));
    const list = candidates.map((c) => evaluate(graph, c.edgeIds.map((id) => graph.edgeIndex.get(id)!), idx, ctx));
    reevaluated.set(key, list);
    return list;
  };

  const phrase = (id: string): Text => {
    const inc = index.byId.get(id);
    return inc ? hazardPhraseText(inc) : tx('hazards.unknown');
  };
  const list = (ids: readonly string[]): Text =>
    ids.slice(0, -1).reduceRight<Text>((tail, id) => tx('cf.join', { head: phrase(id), tail }), phrase(ids[ids.length - 1]!));

  /** Smallest whole-second cut in this route's ranking cost that makes it the recommendation. */
  const timeCut = (route: Evaluated): number | null => {
    const winsWith = (cut: number) =>
      winner(candidates.map((c) => (c.routeId === route.routeId ? { ...c, costS: c.costS - cut } : c))) === route.routeId;
    if (route.costS < 1 || !winsWith(route.costS)) return null;
    let lo = 1;
    let hi = route.costS;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (winsWith(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  for (const route of input.targets) {
    if (route.routeId === input.recommendedRouteId) continue;

    if (!route.viable) {
      const blockerIds = unique(route.blockedBy.map((b) => b.incidentId));
      const wouldBeRecommended = winner(withCleared(blockerIds)) === route.routeId;
      const one = blockerIds.length === 1;
      const text = !wouldBeRecommended
        ? tx('cf.blocked.notEnough', { hazards: list(blockerIds) })
        : one
          ? tx('cf.hazard.one', { hazard: phrase(blockerIds[0]!) })
          : tx('cf.hazard.many', { hazards: list(blockerIds) });
      out.set(route.routeId, { counterfactual: { kind: 'blocked', blockerIds, wouldBeRecommended }, text });
      continue;
    }

    const active = unique(route.hazards.filter((h) => h.effect !== 'none').map((h) => h.incidentId));
    const flips = (ids: readonly string[]) => winner(withCleared(ids)) === route.routeId;
    const single = active.find((id) => flips([id]));
    if (single !== undefined) {
      out.set(route.routeId, {
        counterfactual: { kind: 'hazards', incidentIds: [single], smallest: true },
        text: tx('cf.hazard.one', { hazard: phrase(single) }),
      });
      continue;
    }
    if (active.length > 1 && flips(active)) {
      out.set(route.routeId, {
        counterfactual: { kind: 'hazards', incidentIds: active, smallest: false },
        text: tx('cf.hazard.many', { hazards: list(active) }),
      });
      continue;
    }

    const cutS = timeCut(route);
    if (cutS !== null) {
      out.set(route.routeId, {
        counterfactual: { kind: 'time', cutS },
        text: tx('cf.time', { n: Math.max(1, Math.ceil(cutS / 60)) }),
      });
      continue;
    }
    const reason = active.length ? 'hazards' : 'time';
    out.set(route.routeId, {
      counterfactual: { kind: 'none_sufficient', reason },
      text: tx(reason === 'hazards' ? 'cf.none.hazards' : 'cf.none.time'),
    });
  }
  return out;
}
