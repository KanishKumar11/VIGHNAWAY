/**
 * Engine and contract text in the active language. The engine returns every sentence as
 * structured text (a catalog key plus parameters) next to its English string; this file renders
 * that text with the engine's catalogs, so the phone and the console say the same thing. A plan
 * without structured text (an older payload) falls back to its English string.
 */
import type { Incident, PlanNotice, PlanResult, RouteEvaluation, Text } from '@vighnaway/contracts';
import {
  evidenceText as evidenceTextOf,
  hazardLabelText,
  hazardPhraseText,
  nextActionText,
  renderText,
  ruleDescription,
  SCORING_RULES,
  sourceLabelText,
  spokenChange,
  statusLabelText,
  type RuleKey,
} from '@vighnaway/engine';
import { t } from './en';
import { fmtAge } from './format';
import { getLanguage } from './lang';

const lang = () => getLanguage();

/** A structured engine sentence in the active language, or its English string. */
export const rt = (text: Text | undefined, plain: string): string => (text ? renderText(text, lang()) : plain);

/** "Via Gokhale Bridge" → "Gokhale Bridge होकर" / "Gokhale Bridge मार्गे". */
export const routeLabel = (route: Pick<RouteEvaluation, 'name' | 'nameText'>): string => rt(route.nameText, route.name);

/** The Why card lines and the route reason, in the active language. */
export const reasonOf = (route: RouteEvaluation): string => rt(route.explanation.reasonText, route.explanation.reason);
export const tradeOffOf = (route: RouteEvaluation): string =>
  route.explanation.tradeOff ? rt(route.explanation.tradeOffText, route.explanation.tradeOff) : '';
export const recheckOf = (route: RouteEvaluation): string => rt(route.explanation.recheckIfText, route.explanation.recheckIf);
export const confidenceReasonsOf = (route: RouteEvaluation): string[] =>
  route.explanation.confidenceReasons.map((r, i) => rt(route.explanation.confidenceReasonTexts?.[i], r));

/** "Why not this route?" for a route that is not recommended; empty when the engine gave none. */
export const counterfactualOf = (route: RouteEvaluation): string => (route.counterfactualText ? rt(route.counterfactualText, '') : '');

/** A scoring rule's description in the active language (English is the engine's own). */
export const ruleText = (key: string, plain: string): string =>
  key in SCORING_RULES && key !== 'version' && key !== 'formula' ? ruleDescription(key as RuleKey, lang()) : plain;

export const hazardText = (inc: Incident): string => renderText(hazardLabelText(inc), lang());

/** "Flooding (knee deep) at Andheri Subway". */
export const hazardWhere = (inc: Incident): string => renderText(hazardPhraseText(inc), lang());

export const statusText = (inc: Incident): string => renderText(statusLabelText(inc), lang());

export const sourceText = (inc: Incident): string => renderText(sourceLabelText(inc), lang());

/** "Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated". */
export const evidenceText = (inc: Incident): string => renderText(evidenceTextOf(inc), lang());

/** Spoken label for markers, chips and list rows: hazard, status, source and age. */
export function incidentA11y(inc: Incident, nowS: number): string {
  const ageS = Math.max(0, nowS - inc.lastReportAtS);
  const age = ageS < 60 ? fmtAge(ageS) : t('ageAgoA11y', { age: fmtAge(ageS) });
  return t('incidentA11y', { hazard: hazardWhere(inc), status: statusText(inc), source: sourceText(inc), age });
}

/** "What to do now": the engine's one-sentence next action. */
export const whatToDoNow = (plan: PlanResult, destinationName?: string): string =>
  renderText(nextActionText(plan, destinationName), lang());

/** Route-change banner text: the engine's message and trade-off in the active language. */
export function changeText(plan: PlanResult): { message: string; tradeOff: string } | null {
  const c = plan.change;
  if (!c) return null;
  return { message: rt(c.messageText, c.message), tradeOff: c.tradeOff ? rt(c.tradeOffText, c.tradeOff) : '' };
}

/** Plan notices (Route unchanged, reversal, hazard on the road you are on) in the active language. */
export const noticeText = (notice: PlanNotice): string => rt(notice.messageText, notice.message);

/**
 * Text to speak for a route change, and the language to speak it in. English: the engine's
 * spokenChange. Otherwise the localised banner text with symbols removed; `englishFallback` is
 * used when the phone has no voice for the language.
 */
export function speechFor(plan: PlanResult): { text: string; englishFallback: string } | null {
  const english = spokenChange(plan);
  if (!english) return null;
  if (lang() === 'en') return { text: english, englishFallback: english };
  const local = changeText(plan);
  const text = local ? `${local.message} ${plan.noViableRoute ? whatToDoNow(plan) : ''}`.replace(/[():]/g, ' ').replace(/\s+/g, ' ').trim() : english;
  return { text, englishFallback: english };
}

/** The mandated reversal sentence in English, for checks. */
export const REVERSAL_EN = SCORING_RULES.reversal.value;
