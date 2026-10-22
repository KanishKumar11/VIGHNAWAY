import * as SMS from 'expo-sms';
import { Share } from 'react-native';
import { formatSimClock, type Incident, type PlanResult, type RouteEvaluation } from '@vighnaway/contracts';
import type { Graph } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { evidenceText, routeLabel } from '@/i18n/engineText';
import { fmtDuration } from '@/i18n/format';
import { roadSequence } from './engine';

export interface ShareInput {
  plan: PlanResult;
  route: RouteEvaluation;
  placeName: string;
  graph: Graph;
  incidents: Record<string, Incident>;
  clockStartsAt: string;
  /** Remaining ETA in seconds when en route; the plan ETA otherwise. */
  etaS: number;
  /** Live data mode: "Live data" instead of the simulated-scenario label. */
  live?: boolean;
}

/** Hazards on the other routes that the recommended route does not pass. */
export function hazardsAvoided(plan: PlanResult, route: RouteEvaluation, incidents: Record<string, Incident>): string[] {
  const onRoute = new Set(route.hazards.filter((h) => h.effect !== 'none').map((h) => h.incidentId));
  const ids = new Set<string>();
  for (const r of plan.routes) {
    if (r.routeId === route.routeId) continue;
    for (const b of r.blockedBy) if (!onRoute.has(b.incidentId)) ids.add(b.incidentId);
    for (const h of r.hazards) if (h.effect !== 'none' && !onRoute.has(h.incidentId)) ids.add(h.incidentId);
  }
  return [...ids]
    .sort()
    .map((id) => incidents[id])
    .filter((i): i is Incident => !!i)
    .map((i) => evidenceText(i));
}

/** Plain text only; labelled as the simulated scenario, or as live data in live mode. */
export function buildShareText(input: ShareInput): string {
  const { plan, route, graph } = input;
  const roads = roadSequence(graph, route.edgeIds);
  const avoided = hazardsAvoided(plan, route, input.incidents);
  const lines = [
    t(input.live ? 'shareHeaderLive' : 'shareHeader'),
    t('shareRouteLine', { name: routeLabel(route) }),
    t('shareTo', { place: input.placeName }),
    t('shareEta', { eta: fmtDuration(input.etaS) }),
    `${t('shareTurns')} ${roads.join(' > ')}`,
    avoided.length ? `${t('shareAvoids')} ${avoided.join('; ')}` : t('shareAvoidsNone'),
    t(input.live ? 'shareEvaluatedLive' : 'shareEvaluated', { clock: formatSimClock(input.clockStartsAt, plan.evaluatedAtS) }),
    t(input.live ? 'shareFooterLive' : 'shareFooter'),
  ];
  return lines.join('\n');
}

/** Opens the SMS composer when available, otherwise the system share sheet. */
export async function shareText(message: string): Promise<boolean> {
  try {
    if (await SMS.isAvailableAsync()) {
      await SMS.sendSMSAsync([], message);
      return true;
    }
  } catch {
    // fall through to the share sheet
  }
  try {
    await Share.share({ message, title: t('shareTitle') });
    return true;
  } catch {
    return false;
  }
}
