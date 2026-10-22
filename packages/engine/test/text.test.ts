import { describe, expect, it } from 'vitest';
import type { PlanResult, Text } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import {
  isTextKey,
  loadGraph,
  nextAction,
  nextActionText,
  parityPlans,
  placeholdersOf,
  renderText,
  replanFrom,
  RULE_KEYS,
  ruleDescription,
  SCORING_RULES,
  stripText,
  TEXT_CATALOGS,
  TEXT_LANGS,
  planHash,
  planTrip,
} from '../src';
import type { TextKey } from '../src';
import { andheriGraph, andheriScenario, edgesNamed, incident, noAlerts, place } from './helpers';

const keys = Object.keys(TEXT_CATALOGS.en) as TextKey[];
const names = (s: string) => [...new Set(placeholdersOf(s))].sort();

describe('text catalogs', () => {
  it('have the same keys and placeholders in en, hi and mr', () => {
    for (const lang of TEXT_LANGS) {
      expect(Object.keys(TEXT_CATALOGS[lang]).sort(), lang).toEqual([...keys].sort());
      for (const k of keys) expect(names(TEXT_CATALOGS[lang][k]), `${lang} ${k}`).toEqual(names(TEXT_CATALOGS.en[k]));
    }
  });

  it('use no forbidden words, and safe/सुरक्षित only inside the mandated reversal sentence', () => {
    for (const lang of TEXT_LANGS) {
      for (const k of keys) {
        const s = TEXT_CATALOGS[lang][k];
        expect(findForbiddenWords(s), `${lang} ${k}`).toEqual([]);
        if (lang !== 'en' && k !== 'reversal') expect(s, `${lang} ${k}`).not.toMatch(/सुरक्षित|सुरक्षा|गारंटी|(^|s)हमी(s|$)/);
      }
    }
  });

  it('keep the mandated reversal sentence identical to the scoring rule', () => {
    expect(TEXT_CATALOGS.en.reversal).toBe(SCORING_RULES.reversal.value);
  });

  it('describe every scoring rule in every language', () => {
    const ruleKeys = Object.keys(SCORING_RULES).filter((k) => k !== 'version');
    expect([...RULE_KEYS].sort()).toEqual(ruleKeys.sort());
    for (const k of RULE_KEYS) {
      for (const lang of TEXT_LANGS) {
        const d = ruleDescription(k, lang);
        expect(d.length, `${lang} ${k}`).toBeGreaterThan(10);
        expect(findForbiddenWords(d), `${lang} ${k}`).toEqual([]);
      }
    }
    expect(ruleDescription('switching', 'en')).toBe(SCORING_RULES.switching.description);
  });
});

describe('renderText', () => {
  it('fills placeholders, nests Text, and applies case modifiers to English only', () => {
    const hazard: Text = { key: 'hazard.at', params: { hazard: { key: 'hazard.closure' }, road: 'Andheri Subway' } };
    expect(renderText({ key: 'reason.avoids.hazard', params: { hazard } }, 'en')).toBe(
      'Avoids road closure at Andheri Subway on the usual fastest route.',
    );
    expect(renderText(hazard, 'hi')).toBe('Andheri Subway पर सड़क बंद');
    expect(renderText({ key: 'reason.avoids.hazard', params: { hazard } }, 'mr')).toContain('Andheri Subway');
  });

  it('leaves a missing parameter visible and an unknown key as the key', () => {
    expect(renderText({ key: 'dur.min' }, 'en')).toBe('{n} min');
    expect(renderText({ key: 'no.such.key' }, 'hi')).toBe('no.such.key');
    expect(isTextKey('dur.min')).toBe(true);
    expect(isTextKey('toString')).toBe(false);
  });
});

/** Every (Text, English string) pair a plan carries. */
function textPairs(plan: PlanResult): { where: string; text: Text; plain: string }[] {
  const out: { where: string; text: Text; plain: string }[] = [];
  const add = (where: string, text: Text | undefined, plain: string) => {
    expect(text, where).toBeDefined();
    out.push({ where, text: text!, plain });
  };
  for (const r of plan.routes) {
    add('name', r.nameText, r.name);
    add('reason', r.explanation.reasonText, r.explanation.reason);
    if (r.explanation.tradeOff) add('tradeOff', r.explanation.tradeOffText, r.explanation.tradeOff);
    else expect(r.explanation.tradeOffText).toBeUndefined();
    add('recheckIf', r.explanation.recheckIfText, r.explanation.recheckIf);
    expect(r.explanation.confidenceReasonTexts?.length).toBe(r.explanation.confidenceReasons.length);
    r.explanation.confidenceReasons.forEach((s, i) => add('confidence', r.explanation.confidenceReasonTexts![i], s));
  }
  if (plan.change) {
    add('change', plan.change.messageText, plan.change.message);
    if (plan.change.tradeOff) add('change.tradeOff', plan.change.tradeOffText, plan.change.tradeOff);
  }
  for (const n of plan.notices) add(`notice.${n.kind}`, n.messageText, n.message);
  add('next', nextActionText(plan, 'Kokilaben Hospital'), nextAction(plan, 'Kokilaben Hospital'));
  return out;
}

function walkKeys(t: Text, seen: Set<string>) {
  seen.add(t.key);
  for (const p of Object.values(t.params ?? {})) if (typeof p === 'object') walkKeys(p, seen);
}

describe('engine text over every parity plan', () => {
  const plans = parityPlans(andheriGraph, andheriScenario);
  const car = loadGraph(andheriGraph, 'car');
  const sre = andheriGraph.edges.find((e) => e.name === 'Station Road East' && e.geometry[0]![1] < e.geometry[1]![1])!;
  const extra: { label: string; plan: PlanResult }[] = [
    {
      label: 'reversal',
      plan: replanFrom({
        graph: car,
        destination: place('hosp-kokilaben').nodeId,
        currentRoute: [sre.id],
        vehicle: { edgeId: sre.id, fraction: 0.5 },
        incidents: [],
        nowS: 0,
        ...noAlerts,
      }),
    },
    {
      label: 'on blocked edge',
      plan: (() => {
        const start = planTrip({ graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, incidents: [], nowS: 0, ...noAlerts });
        const rec = start.routes[0]!;
        const subway = edgesNamed(andheriGraph, 'Andheri Subway');
        return replanFrom({
          graph: car,
          destination: place('hosp-kokilaben').nodeId,
          currentRoute: rec.edgeIds,
          vehicle: { edgeId: rec.edgeIds.find((id) => subway.includes(id))!, fraction: 0.3 },
          incidents: [incident({ type: 'closure', status: 'verified', edgeIds: subway, roadName: 'Andheri Subway' })],
          nowS: 0,
          ...noAlerts,
        });
      })(),
    },
  ];
  const all = [...plans, ...extra];

  it('builds Text for every sentence, and the English rendering equals the English string', () => {
    let pairs = 0;
    for (const { label, plan } of all) {
      for (const { where, text, plain } of textPairs(plan)) {
        expect(renderText(text, 'en'), `${label} ${where}`).toBe(plain);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(1000);
  });

  it('renders every key and parameter in en, hi and mr with nothing left over or forbidden', () => {
    const used = new Set<string>();
    for (const { label, plan } of all) {
      for (const { where, text } of textPairs(plan)) {
        walkKeys(text, used);
        for (const lang of TEXT_LANGS) {
          const s = renderText(text, lang);
          expect(s, `${label} ${where} ${lang}`).not.toMatch(/\{\w+(\|\w+)?\}/);
          expect(findForbiddenWords(s), `${label} ${where} ${lang}`).toEqual([]);
          if (lang !== 'en') expect(s, `${label} ${where} ${lang}`).not.toMatch(/\b(Fastest|Avoids|Re-check|Route changed|Not viable)\b/);
        }
      }
    }
    for (const k of used) expect(isTextKey(k), k).toBe(true);
    // The scenario exercises most of the catalog; the rest is covered by the placeholder tests above.
    expect(used.size).toBeGreaterThan(40);
  });

  it('does not let the text companions change a plan hash', () => {
    for (const { plan } of all.slice(0, 20)) {
      expect(planHash(plan)).toBe(planHash(stripText(plan)));
      expect(JSON.stringify(stripText(plan))).not.toContain('Text"');
    }
  });
});
