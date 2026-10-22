import type {
  Confidence,
  Explanation,
  Incident,
  RouteChange,
  RouteHazard,
} from '@vighnaway/contracts';
import { formatDelta, sourceLabel, statusLabel } from '@vighnaway/contracts';
import type { Evaluated } from './evaluate';
import { hasConflictingHazard, hasStaleHazard } from './evaluate';
import type { RankDecision } from './rank';
import { SCORING_RULES } from './rules';

/** Plain-language templates. Shown verbatim on the phone and console; no forbidden words. */

const DEPTH_LABEL: Record<string, string> = { ankle: 'ankle deep', knee: 'knee deep', waist: 'waist deep' };

export function hazardLabel(inc: Incident): string {
  switch (inc.type) {
    case 'flood':
      return `Flooding (${inc.depth ? DEPTH_LABEL[inc.depth] : 'depth not given'})`;
    case 'closure':
      return 'Road closure';
    case 'congestion':
      return `${inc.congestion ? inc.congestion[0]!.toUpperCase() + inc.congestion.slice(1) : 'Moderate'} congestion`;
    case 'debris':
      return inc.impassable ? 'Debris (reported impassable)' : 'Debris';
    case 'accident':
      return inc.impassable ? 'Accident (reported impassable)' : 'Accident';
  }
}

export function hazardPhrase(inc: Incident): string {
  const where = inc.roadName ? ` ${inc.type === 'congestion' ? 'on' : 'at'} ${inc.roadName}` : '';
  return `${hazardLabel(inc)}${where}`;
}

/** "Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated" */
export function evidencePhrase(inc: Incident): string {
  // A live-feed status label already names its provider ("Reported by TomTom live traffic").
  if (inc.source === 'live_feed' && inc.status === 'corroborated') return `${hazardPhrase(inc)}: ${statusLabel(inc)}`;
  return `${hazardPhrase(inc)}: ${statusLabel(inc)}, ${sourceLabel(inc)}`;
}

function etaChangePhrase(deltaS: number): string {
  const min = Math.round(deltaS / 60);
  if (min > 0) return `adds ${min} min`;
  if (min < 0) return `saves ${Math.abs(min)} min`;
  return 'takes about the same time';
}

function activeHazards(ev: Evaluated): RouteHazard[] {
  return ev.hazards.filter((h) => h.effect !== 'none');
}

function summarizeHazards(ev: Evaluated, incidents: ReadonlyMap<string, Incident>): string {
  const hs = activeHazards(ev);
  if (!hs.length) return 'no reported hazards';
  const first = incidents.get(hs[0]!.incidentId);
  const head = first ? `${hazardPhrase(first)} (${statusLabel(first)})` : 'a reported hazard';
  return hs.length === 1 ? head : `${head} and ${hs.length - 1} more`;
}

export interface ExplainContext {
  incidents: ReadonlyMap<string, Incident>;
  usualFastest: Evaluated | null;
  recommended: Evaluated | null;
  hasAlertInformation: boolean;
  rainAlertActive: boolean;
  isReversal: boolean;
  /** Set when the recommendation was kept although another route scores lower (below threshold). */
  keptDespiteGainS: number | null;
}

/** Confidence label from the decision table. Low is checked first, then Medium. Never a percentage. */
export function confidenceFor(
  ev: Evaluated,
  others: readonly Evaluated[],
  ctx: Pick<ExplainContext, 'hasAlertInformation' | 'isReversal'>,
): { confidence: Confidence; reasons: string[] } {
  const { lowGapS, mediumGapS } = SCORING_RULES.confidence.value;
  const otherViable = others.filter((o) => o.viable && o.routeId !== ev.routeId);
  const gap = otherViable.length ? Math.min(...otherViable.map((o) => Math.abs(o.costS - ev.costS))) : null;
  const reliesOnStale =
    hasStaleHazard(ev) ||
    others.some(
      (o) => !o.viable && o.usesStaleBlock && o.blockedBy.length > 0 && o.etaS < ev.etaS && o.routeId !== ev.routeId,
    );

  const low: string[] = [];
  if (hasConflictingHazard(ev)) low.push('A Road clear report conflicts with an incident on this route');
  if (reliesOnStale) low.push('Relies on a report older than 3 hours');
  if (gap !== null && gap <= lowGapS) low.push('Another route scores almost the same');
  if (ctx.isReversal) low.push('Turning back is the only option left');
  if (low.length) return { confidence: 'low', reasons: low };

  const medium: string[] = [];
  const unverified = ev.hazards.filter((h) => h.status === 'unverified' && h.effect !== 'none').length;
  if (unverified) medium.push(unverified === 1 ? '1 unverified report on this route' : `${unverified} unverified reports on this route`);
  if (ev.dataGaps.length) {
    const road = ev.dataGaps[0]!.roadName;
    medium.push(road ? `No recent reports on ${road}` : 'No recent reports on a flood-prone road');
  }
  if (!ctx.hasAlertInformation && ev.floodProneEdgeCount > 0) medium.push('No rain alert information');
  if (gap !== null && gap > lowGapS && gap <= mediumGapS) medium.push('Another route scores close to this one');
  if (medium.length) return { confidence: 'medium', reasons: medium };

  return { confidence: 'high', reasons: [] };
}

function recheckIf(ev: Evaluated, incidents: ReadonlyMap<string, Incident>): string {
  const unverified = activeHazards(ev).find((h) => h.status === 'unverified');
  if (unverified) {
    const inc = incidents.get(unverified.incidentId);
    return `Re-check if the report ${inc?.roadName ? `at ${inc.roadName} ` : ''}is corroborated or verified.`;
  }
  const gap = ev.dataGaps[0];
  if (gap) return `Re-check if reports arrive from ${gap.roadName ?? 'the flood-prone stretch'}.`;
  const crossing = ev.crossings[0];
  if (crossing) return `Re-check if anything is reported on ${crossing.name}.`;
  return 'Re-check if a new incident is reported on this route.';
}

/** reason, trade-off, re-check-if and confidence for one route. */
export function explain(ev: Evaluated, others: readonly Evaluated[], ctx: ExplainContext): Explanation {
  const { confidence, reasons } = confidenceFor(ev, others, ctx);
  const incidents = ctx.incidents;
  const uf = ctx.usualFastest;
  const rec = ctx.recommended;
  const isUsual = uf !== null && uf.routeId === ev.routeId;
  let reason: string;
  let tradeOff = '';

  if (!ev.viable) {
    const b = ev.blockedBy[0]!;
    const inc = incidents.get(b.incidentId);
    reason = inc ? `Not viable: ${evidencePhrase(inc)}.` : 'Not viable: a reported blockage.';
    if (ev.usesStaleBlock) reason += ' The report is older than 3 hours but stays in force until an operator resolves it.';
    return { reason, tradeOff, recheckIf: 'Re-check if the operator resolves it.', confidence, confidenceReasons: reasons };
  }

  if (rec && ev.routeId === rec.routeId) {
    if (ctx.isReversal) {
      reason = `${SCORING_RULES.reversal.value}. No forward route is viable.`;
    } else if (isUsual || !uf) {
      const hs = activeHazards(ev);
      if (!hs.length && !ev.dataGaps.length) reason = 'Fastest route, no reported hazards.';
      else if (!hs.length) reason = `Fastest route. No recent reports on ${ev.dataGaps[0]!.roadName ?? 'a flood-prone road'} during the rain alert.`;
      else reason = `Fastest route. ${capitalize(summarizeHazards(ev, incidents))} does not outweigh a detour.`;
      if (ctx.keptDespiteGainS !== null && ctx.keptDespiteGainS > 0) {
        reason = `Kept: no other route is better by more than the switching threshold. ${reason}`;
      }
    } else if (!uf.viable) {
      const inc = incidents.get(uf.blockedBy[0]!.incidentId);
      reason = inc
        ? `Avoids ${lowerFirst(hazardPhrase(inc))} (${statusLabel(inc)}), which makes the usual fastest route not viable.`
        : 'Avoids a blockage on the usual fastest route.';
    } else {
      const main = activeHazards(uf)[0];
      const inc = main ? incidents.get(main.incidentId) : undefined;
      reason = inc
        ? `Avoids ${inc.status === 'unverified' ? 'an unconfirmed report of ' : ''}${lowerFirst(hazardPhrase(inc))} on the usual fastest route.`
        : 'Avoids a data gap on the usual fastest route.';
      if (ctx.keptDespiteGainS !== null && ctx.keptDespiteGainS > 0) {
        reason = `Kept: no other route is better by more than the switching threshold. ${reason}`;
      }
    }
    if (uf && !isUsual) tradeOff = `${formatDelta(ev.etaS - uf.etaS)} compared with the usual fastest route`;
    else if (activeHazards(ev).length) tradeOff = `Passes ${summarizeHazards(ev, incidents)}`;
    else tradeOff = 'None: this is also the fastest route';
  } else if (isUsual) {
    reason = `Usual fastest route, but it has ${summarizeHazards(ev, incidents)}.`;
    if (rec) tradeOff = `${formatDelta(ev.etaS - rec.etaS)} compared with the recommended route`;
  } else {
    reason = `Alternative with ${summarizeHazards(ev, incidents)}.`;
    if (rec) tradeOff = `${formatDelta(ev.etaS - rec.etaS)} compared with the recommended route`;
  }
  return { reason, tradeOff, recheckIf: recheckIf(ev, incidents), confidence, confidenceReasons: reasons };
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

/** Facts for the banner and activity entry when the recommendation changes. */
export function describeChange(
  decision: RankDecision,
  next: Evaluated | null,
  previous: Evaluated | null,
): RouteChange | null {
  if (decision.kind === 'initial' || decision.kind === 'kept') return null;
  const t = decision.trigger;
  const trigger = t ? { incidentId: t.id, type: t.type, status: t.status, source: t.source } : null;
  const cause = t ? `${evidencePhrase(t)}.` : '';
  if (decision.kind === 'no_viable_route' || !next) {
    return {
      fromRouteId: decision.previousRouteId,
      toRouteId: null,
      kind: 'no_viable_route',
      trigger,
      gainS: null,
      message: `No viable route. ${cause}`.trim(),
      tradeOff: '',
    };
  }
  const delta = previous ? next.etaS - previous.etaS : 0;
  const tradeOff = previous ? `${formatDelta(delta)} compared with the previous route` : '';
  const lead =
    decision.kind === 'invalid'
      ? `Route changed. ${cause}`
      : `Route changed. ${t ? cause : 'Another route is now clearly better.'}`;
  return {
    fromRouteId: decision.previousRouteId,
    toRouteId: next.routeId,
    kind: decision.kind,
    trigger,
    gainS: decision.gainS,
    message: `${lead} New route ${next.name.replace(/^Via /, 'via ')} ${etaChangePhrase(delta)}.`.replace(/\s+/g, ' '),
    tradeOff,
  };
}
