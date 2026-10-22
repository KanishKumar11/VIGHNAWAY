/**
 * Engine and contract text in the active language. The engine writes English sentences; the app
 * shows them unchanged in English, and composes the same facts in Hindi or Marathi from the plan's
 * structured fields (never by translating the English sentence). Detailed engine explanations
 * (Why this route, rule descriptions) stay in English for now; see the report.
 */
import { FEED_PROVIDER_LABEL, sourceLabel, statusLabel, type Incident, type PlanNotice, type PlanResult, type RouteEvaluation } from '@vighnaway/contracts';
import { evidencePhrase, hazardLabel, hazardPhrase, nextAction, spokenChange, SCORING_RULES } from '@vighnaway/engine';
import { t, type StringKey } from './en';
import { fmtAge, fmtDuration } from './format';
import { getLanguage } from './lang';

const en = () => getLanguage() === 'en';

/** "Via Gokhale Bridge" → "Gokhale Bridge होकर" / "Gokhale Bridge मार्गे". */
export function routeName(name: string): string {
  if (en()) return name;
  const road = name.replace(/^Via /, '');
  return road === name ? name : t('viaRoad', { road });
}

/** The road a route goes via, for sentences ("via Gokhale Bridge"). */
const viaOf = (name: string) => name.replace(/^Via /, '');

export function hazardText(inc: Incident): string {
  if (en()) return hazardLabel(inc);
  switch (inc.type) {
    case 'flood': {
      const word: Record<string, StringKey> = { ankle: 'depthAnkleWord', knee: 'depthKneeWord', waist: 'depthWaistWord' };
      return inc.depth ? t('hazardFloodDepth', { depth: t(word[inc.depth]!) }) : t('hazardFloodNoDepth');
    }
    case 'closure':
      return t('hazardClosure');
    case 'congestion':
      return t(inc.congestion === 'heavy' ? 'hazardCongestionHeavy' : inc.congestion === 'standstill' ? 'hazardCongestionStandstill' : 'hazardCongestionModerate');
    case 'debris':
      return t(inc.impassable ? 'hazardDebrisImpassable' : 'hazardDebris');
    default:
      return t(inc.impassable ? 'hazardAccidentImpassable' : 'hazardAccident');
  }
}

/** "Flooding (knee deep) at Andheri Subway". */
export function hazardWhere(inc: Incident): string {
  if (en()) return hazardPhrase(inc);
  const h = hazardText(inc);
  if (!inc.roadName) return h;
  return t(inc.type === 'congestion' ? 'hazardOn' : 'hazardAt', { hazard: h, road: inc.roadName });
}

export function statusText(inc: Incident): string {
  if (en()) return statusLabel(inc);
  if (inc.status === 'corroborated' && inc.source === 'live_feed') {
    return t('statusFeedReported', { provider: inc.feed ? FEED_PROVIDER_LABEL[inc.feed.provider] : 'TomTom' });
  }
  switch (inc.status) {
    case 'corroborated':
      return t('statusCorroborated', { n: inc.deviceCount });
    case 'verified':
      return t(inc.verifiedBy === 'simulated_operator' ? 'statusVerifiedSim' : 'statusVerified');
    case 'resolved':
      return t('statusResolved');
    case 'dismissed':
      return t('statusDismissed');
    default:
      return t('statusUnverified');
  }
}

export function sourceText(inc: Incident): string {
  if (en()) return sourceLabel(inc);
  switch (inc.source) {
    case 'simulated':
      return t('sourceSimulated');
    case 'user_report':
      return t('sourceUser');
    case 'operator':
      return t('sourceOperator');
    default:
      return t('sourceFeed', { provider: inc.feed ? FEED_PROVIDER_LABEL[inc.feed.provider] : 'TomTom' });
  }
}

/** "Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated". */
export function evidenceText(inc: Incident): string {
  if (en()) return evidencePhrase(inc);
  if (inc.source === 'live_feed' && inc.status === 'corroborated') return `${hazardWhere(inc)}: ${statusText(inc)}`;
  return t('evidenceLine', { hazard: hazardWhere(inc), status: statusText(inc), source: sourceText(inc) });
}

/** Spoken label for markers, chips and list rows: hazard, status, source and age. */
export function incidentA11y(inc: Incident, nowS: number): string {
  const ageS = Math.max(0, nowS - inc.lastReportAtS);
  const age = ageS < 60 ? fmtAge(ageS) : t('ageAgoA11y', { age: fmtAge(ageS) });
  return t('incidentA11y', { hazard: hazardWhere(inc), status: statusText(inc), source: sourceText(inc), age });
}

/** "What to do now": the engine's nextAction in English; the same facts composed otherwise. */
export function whatToDoNow(plan: PlanResult, destinationName?: string): string {
  if (en()) return nextAction(plan, destinationName);
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  if (plan.isReversal) return t('nextReversal', { reversal: t('reversalSentence') });
  if (!rec) {
    if (plan.reachable) return t('nextNoViableReach', { place: plan.reachable.placeName, eta: fmtDuration(plan.reachable.etaS) });
    return t('nextNoViable');
  }
  const eta = fmtDuration(rec.etaS + plan.leadInS);
  return destinationName ? t('nextTake', { via: viaOf(rec.name), place: destinationName, eta }) : t('nextTakeShort', { via: viaOf(rec.name), eta });
}

function deltaText(deltaS: number): string {
  const min = Math.round(deltaS / 60);
  if (min > 0) return t('deltaAdds', { n: min });
  if (min < 0) return t('deltaSaves', { n: Math.abs(min) });
  return t('deltaSame');
}

/**
 * Route-change banner text. English: the engine's message and trade-off unchanged. Otherwise the
 * same facts (trigger evidence, new route, ETA change) composed from structured fields.
 */
export function changeText(
  plan: PlanResult,
  fromRoute: RouteEvaluation | null,
  incidents: Record<string, Incident>,
): { message: string; tradeOff: string } | null {
  const c = plan.change;
  if (!c) return null;
  if (en()) return { message: c.message, tradeOff: c.tradeOff };
  const trigger = c.trigger ? incidents[c.trigger.incidentId] : undefined;
  const cause = trigger ? `${evidenceText(trigger)}.` : '';
  const rec = plan.routes.find((r) => r.routeId === c.toRouteId) ?? null;
  if (c.kind === 'no_viable_route' || !rec) return { message: t('changeNoViable', { cause }).trim(), tradeOff: '' };
  const deltaS = fromRoute ? rec.etaS - fromRoute.etaS : 0;
  const message = t('changeRouteChanged', { cause: trigger ? cause : t('changeBetter'), road: viaOf(rec.name), delta: deltaText(deltaS) }).replace(/\s+/g, ' ');
  const tradeOff = fromRoute ? t('tradeOffPrev', { delta: fmtDeltaShort(deltaS) }) : '';
  return { message, tradeOff };
}

const fmtDeltaShort = (s: number) => {
  const min = Math.round(s / 60);
  return min === 0 ? t('fmtSame') : min > 0 ? t('fmtAdds', { n: min }) : t('fmtSaves', { n: Math.abs(min) });
};

/** Plan notices (Route unchanged, reversal, hazard on the road you are on) in the active language. */
export function noticeText(notice: PlanNotice, plan: PlanResult, incidents: Record<string, Incident>): string {
  if (en()) return notice.message;
  switch (notice.kind) {
    case 'reversal':
      return t('reversalSentence');
    case 'unchanged_with_hazard': {
      const many = /Route unchanged: (\d+) unverified reports/.exec(notice.message);
      if (/one unverified report/.test(notice.message)) return t('noticeUnchangedOne');
      if (many) return t('noticeUnchangedMany', { n: many[1]! });
      return t('noticeUnchangedHazard');
    }
    case 'on_blocked_edge': {
      const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
      const inc = rec?.hazards[0] ? incidents[rec.hazards[0].incidentId] : undefined;
      return t('noticeOnBlockedEdge', { hazard: inc ? hazardWhere(inc) : t('hazardClosure') });
    }
    default:
      return t('nextNoViable');
  }
}

/**
 * Text to speak for a route change, and the language to speak it in. English: the engine's
 * spokenChange. Otherwise the localised banner text with symbols removed; `englishFallback` is
 * used when the phone has no voice for the language.
 */
export function speechFor(plan: PlanResult, fromRoute: RouteEvaluation | null, incidents: Record<string, Incident>): { text: string; englishFallback: string } | null {
  const english = spokenChange(plan);
  if (!english) return null;
  if (en()) return { text: english, englishFallback: english };
  const local = changeText(plan, fromRoute, incidents);
  const text = local ? `${local.message} ${plan.noViableRoute ? whatToDoNow(plan) : ''}`.replace(/[():]/g, ' ').replace(/\s+/g, ' ').trim() : english;
  return { text, englishFallback: english };
}

/** The mandated reversal sentence in English, for checks. */
export const REVERSAL_EN = SCORING_RULES.reversal.value;
