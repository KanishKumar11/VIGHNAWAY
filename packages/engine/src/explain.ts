import type {
  Confidence,
  Explanation,
  Incident,
  RouteChange,
  RouteHazard,
  Text,
} from '@vighnaway/contracts';
import type { Evaluated } from './evaluate';
import { hasConflictingHazard, hasStaleHazard } from './evaluate';
import type { RankDecision } from './rank';
import { SCORING_RULES } from './rules';
import {
  crossingNameText,
  deltaText,
  etaChangeText,
  evidenceText,
  hazardLabelText,
  hazardPhraseText,
  statusLabelText,
  tx,
  viaLowerText,
} from './text/build';
import { renderText } from './text/render';

/**
 * Every sentence is built as structured Text (a catalog key plus parameters) and rendered in
 * English into the plain string fields next to it. Clients render the Text in the user's language
 * (text/render.ts). Shown verbatim on the phone and console; no forbidden words.
 */

const en = (t: Text): string => renderText(t, 'en');

export const hazardLabel = (inc: Incident): string => en(hazardLabelText(inc));

export const hazardPhrase = (inc: Incident): string => en(hazardPhraseText(inc));

/** "Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated" */
export const evidencePhrase = (inc: Incident): string => en(evidenceText(inc));

function activeHazards(ev: Evaluated): RouteHazard[] {
  return ev.hazards.filter((h) => h.effect !== 'none');
}

function summarizeHazards(ev: Evaluated, incidents: ReadonlyMap<string, Incident>): Text {
  const hs = activeHazards(ev);
  if (!hs.length) return tx('hazards.none');
  const first = incidents.get(hs[0]!.incidentId);
  const head = first ? tx('hazards.head', { hazard: hazardPhraseText(first), status: statusLabelText(first) }) : tx('hazards.unknown');
  return hs.length === 1 ? head : tx('hazards.more', { head, n: hs.length - 1 });
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
): { confidence: Confidence; reasons: string[]; reasonTexts: Text[] } {
  const { lowGapS, mediumGapS } = SCORING_RULES.confidence.value;
  const otherViable = others.filter((o) => o.viable && o.routeId !== ev.routeId);
  const gap = otherViable.length ? Math.min(...otherViable.map((o) => Math.abs(o.costS - ev.costS))) : null;
  const reliesOnStale =
    hasStaleHazard(ev) ||
    others.some(
      (o) => !o.viable && o.usesStaleBlock && o.blockedBy.length > 0 && o.etaS < ev.etaS && o.routeId !== ev.routeId,
    );
  const result = (confidence: Confidence, texts: Text[]) => ({ confidence, reasons: texts.map(en), reasonTexts: texts });

  const low: Text[] = [];
  if (hasConflictingHazard(ev)) low.push(tx('conf.conflict'));
  if (reliesOnStale) low.push(tx('conf.stale'));
  if (gap !== null && gap <= lowGapS) low.push(tx('conf.almostSame'));
  if (ctx.isReversal) low.push(tx('conf.reversal'));
  if (low.length) return result('low', low);

  const medium: Text[] = [];
  const unverified = ev.hazards.filter((h) => h.status === 'unverified' && h.effect !== 'none').length;
  if (unverified) medium.push(unverified === 1 ? tx('conf.unverified.one') : tx('conf.unverified.many', { n: unverified }));
  if (ev.dataGaps.length) {
    const road = ev.dataGaps[0]!.roadName;
    medium.push(road ? tx('conf.gap.road', { road }) : tx('conf.gap.unnamed'));
  }
  if (!ctx.hasAlertInformation && ev.floodProneEdgeCount > 0) medium.push(tx('conf.noAlert'));
  if (gap !== null && gap > lowGapS && gap <= mediumGapS) medium.push(tx('conf.close'));
  if (medium.length) return result('medium', medium);

  return result('high', []);
}

function recheckIf(ev: Evaluated, incidents: ReadonlyMap<string, Incident>): Text {
  const unverified = activeHazards(ev).find((h) => h.status === 'unverified');
  if (unverified) {
    const inc = incidents.get(unverified.incidentId);
    return inc?.roadName ? tx('recheck.unverified.road', { road: inc.roadName }) : tx('recheck.unverified');
  }
  const gap = ev.dataGaps[0];
  if (gap) return tx('recheck.gap', { road: gap.roadName ?? tx('place.floodStretch') });
  const crossing = ev.crossings[0];
  if (crossing) return tx('recheck.crossing', { crossing: crossingNameText(crossing) });
  return tx('recheck.default');
}

/** reason, trade-off, re-check-if and confidence for one route. */
export function explain(ev: Evaluated, others: readonly Evaluated[], ctx: ExplainContext): Explanation {
  const { confidence, reasons, reasonTexts } = confidenceFor(ev, others, ctx);
  const incidents = ctx.incidents;
  const uf = ctx.usualFastest;
  const rec = ctx.recommended;
  const isUsual = uf !== null && uf.routeId === ev.routeId;

  const build = (reason: Text, tradeOff: Text | null, recheck: Text): Explanation => ({
    reason: en(reason),
    tradeOff: tradeOff ? en(tradeOff) : '',
    recheckIf: en(recheck),
    confidence,
    confidenceReasons: reasons,
    reasonText: reason,
    ...(tradeOff ? { tradeOffText: tradeOff } : {}),
    recheckIfText: recheck,
    confidenceReasonTexts: reasonTexts,
  });

  if (!ev.viable) {
    const b = ev.blockedBy[0]!;
    const inc = incidents.get(b.incidentId);
    let reason = inc ? tx('reason.notViable', { evidence: evidenceText(inc) }) : tx('reason.notViable.unknown');
    if (ev.usesStaleBlock) reason = tx('reason.staleBlock', { reason });
    return build(reason, null, tx('recheck.operator'));
  }

  const kept = (r: Text): Text => (ctx.keptDespiteGainS !== null && ctx.keptDespiteGainS > 0 ? tx('reason.kept', { reason: r }) : r);
  let reason: Text;
  let tradeOff: Text | null = null;

  if (rec && ev.routeId === rec.routeId) {
    if (ctx.isReversal) {
      reason = tx('reason.reversal', { reversal: tx('reversal') });
    } else if (isUsual || !uf) {
      const hs = activeHazards(ev);
      if (!hs.length && !ev.dataGaps.length) reason = tx('reason.fastest.clear');
      else if (!hs.length) reason = tx('reason.fastest.gap', { road: ev.dataGaps[0]!.roadName ?? tx('place.floodProneRoad') });
      else reason = tx('reason.fastest.hazards', { hazards: summarizeHazards(ev, incidents) });
      reason = kept(reason);
    } else if (!uf.viable) {
      const inc = incidents.get(uf.blockedBy[0]!.incidentId);
      reason = inc
        ? tx('reason.avoids.block', { hazard: hazardPhraseText(inc), status: statusLabelText(inc) })
        : tx('reason.avoids.blockUnknown');
    } else {
      const main = activeHazards(uf)[0];
      const inc = main ? incidents.get(main.incidentId) : undefined;
      reason = inc
        ? tx(inc.status === 'unverified' ? 'reason.avoids.unconfirmed' : 'reason.avoids.hazard', { hazard: hazardPhraseText(inc) })
        : tx('reason.avoids.gap');
      reason = kept(reason);
    }
    if (uf && !isUsual) tradeOff = tx('trade.vsUsual', { delta: deltaText(ev.etaS - uf.etaS) });
    else if (activeHazards(ev).length) tradeOff = tx('trade.passes', { hazards: summarizeHazards(ev, incidents) });
    else tradeOff = tx('trade.none');
  } else if (isUsual) {
    reason = tx('reason.usual', { hazards: summarizeHazards(ev, incidents) });
    if (rec) tradeOff = tx('trade.vsRecommended', { delta: deltaText(ev.etaS - rec.etaS) });
  } else {
    reason = tx('reason.alternative', { hazards: summarizeHazards(ev, incidents) });
    if (rec) tradeOff = tx('trade.vsRecommended', { delta: deltaText(ev.etaS - rec.etaS) });
  }
  return build(reason, tradeOff, recheckIf(ev, incidents));
}

/** Facts for the banner and activity entry when the recommendation changes. */
export function describeChange(
  decision: RankDecision,
  next: Evaluated | null,
  previous: Evaluated | null,
): RouteChange | null {
  if (decision.kind === 'initial' || decision.kind === 'kept') return null;
  const t = decision.trigger;
  const trigger = t ? { incidentId: t.id, type: t.type, status: t.status, source: t.source } : null;
  const cause = t ? tx('change.cause', { evidence: evidenceText(t) }) : null;
  if (decision.kind === 'no_viable_route' || !next) {
    const messageText = cause ? tx('change.noViable.cause', { cause }) : tx('change.noViable');
    return {
      fromRouteId: decision.previousRouteId,
      toRouteId: null,
      kind: 'no_viable_route',
      trigger,
      gainS: null,
      message: en(messageText),
      tradeOff: '',
      messageText,
    };
  }
  const delta = previous ? next.etaS - previous.etaS : 0;
  const tradeOffText = previous ? tx('trade.vsPrevious', { delta: deltaText(delta) }) : null;
  const params = { via: viaLowerText(next.name, next.nameText), eta: etaChangeText(delta) };
  // A change with no trigger says "Another route is now clearly better" unless the old route stopped being viable.
  const messageText = cause
    ? tx('change.new', { cause, ...params })
    : tx(decision.kind === 'invalid' ? 'change.new.nocause' : 'change.new.better', params);
  return {
    fromRouteId: decision.previousRouteId,
    toRouteId: next.routeId,
    kind: decision.kind,
    trigger,
    gainS: decision.gainS,
    message: en(messageText).replace(/\s+/g, ' '),
    tradeOff: tradeOffText ? en(tradeOffText) : '',
    messageText,
    ...(tradeOffText ? { tradeOffText } : {}),
  };
}
