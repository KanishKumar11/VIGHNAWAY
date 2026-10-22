import type { Incident, PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import type { Text } from '@vighnaway/contracts';
import type { Graph } from './graph';
import type { EvalContext, IncidentIndex } from './incidents';
import { buildIncidentIndex, incidentEffect } from './incidents';
import { durationText, tx, viaRoadText } from './text/build';
import { renderText } from './text/render';

/**
 * Presentation helpers: derived from engine results, never used to decide anything.
 */

export interface RouteSegmentFlow {
  edgeId: string;
  /** Modelled speed on this edge right now, km/h (free-flow divided by verified congestion). */
  speedKmh: number;
  /** 1 = free flow; 2.5 = heavy congestion; Infinity when blocked. */
  slowdown: number;
  blocked: boolean;
}

/**
 * Per-edge speeds along a route, for the "flow speed = travel speed" animation: dashes glide on
 * free-flowing roads, crawl in verified or corroborated congestion and stop on a hard block.
 */
export function routeFlow(
  graph: Graph,
  edgeIds: readonly string[],
  incidents: readonly Incident[] | IncidentIndex,
  ctx: EvalContext,
): RouteSegmentFlow[] {
  const index = 'sorted' in incidents ? incidents : buildIncidentIndex(incidents);
  return edgeIds.map((id) => {
    const ei = graph.edgeIndex.get(id);
    if (ei === undefined) return { edgeId: id, speedKmh: 0, slowdown: Infinity, blocked: true };
    const e = graph.edges[ei]!;
    let mult = 1;
    let blocked = false;
    for (const inc of index.openByEdge.get(e.baseId) ?? []) {
      const eff = incidentEffect(inc, ctx);
      if (eff.kind === 'block') blocked = true;
      if (eff.kind === 'congestion') mult = Math.max(mult, eff.multiplier);
    }
    const free = e.timeS > 0 ? (e.lengthM / e.timeS) * 3.6 : 0;
    return {
      edgeId: id,
      speedKmh: blocked ? 0 : Math.round((free / mult) * 10) / 10,
      slowdown: blocked ? Infinity : mult,
      blocked,
    };
  });
}

/** Dash animation duration for a segment, relative to `baseMs` at 30 km/h; capped for legibility. */
export function flowDurationMs(seg: Pick<RouteSegmentFlow, 'speedKmh' | 'blocked'>, baseMs = 1600): number | null {
  if (seg.blocked || seg.speedKmh <= 0) return null;
  return Math.round(Math.min(baseMs * 6, Math.max(baseMs / 2, (baseMs * 30) / seg.speedKmh)));
}

/**
 * One plain sentence telling the user what to do now, for stressed or glancing users and for
 * spoken announcements, as structured text. Derived from the plan only.
 */
export function nextActionText(plan: PlanResult, destinationName?: string): Text {
  const rec: RouteEvaluation | undefined = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  if (plan.isReversal) return tx('next.reversal', { reversal: tx('reversal') });
  if (!rec) {
    if (plan.reachable) return tx('next.noViable.reach', { place: plan.reachable.placeName, eta: durationText(plan.reachable.etaS) });
    return tx('next.noViable');
  }
  const via = viaRoadText(rec.name, rec.nameText);
  const eta = durationText(rec.etaS + plan.leadInS);
  return destinationName ? tx('next.take', { via, place: destinationName, eta }) : tx('next.takeShort', { via, eta });
}

/** The same sentence in English. */
export const nextAction = (plan: PlanResult, destinationName?: string): string =>
  renderText(nextActionText(plan, destinationName), 'en');

/**
 * Text for a spoken route-change announcement: short, calm, no symbols, numbers spelled as words
 * the speech engine reads well ("five minutes").
 */
export function spokenChange(plan: PlanResult): string | null {
  const c = plan.change;
  if (!c) return null;
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  const say = (s: string) =>
    s
      .replace(/\((\d+) devices?\)/g, 'by $1 devices')
      .replace(/(\d+) min\b/g, (_m, n: string) => `${n} minute${n === '1' ? '' : 's'}`)
      .replace(/[()]/g, '')
      .replace(/:/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  if (c.kind === 'no_viable_route' || !rec) return say(`${c.message} ${nextAction(plan)}`);
  return say(c.message);
}
