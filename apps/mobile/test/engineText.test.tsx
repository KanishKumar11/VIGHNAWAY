import { render } from '@testing-library/react-native';
import { findForbiddenWords } from '@vighnaway/contracts';
import type { Incident, PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import { decodeReceipt, planTrip, renderText } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { WhyCard } from '@/components/WhyCard';
import { SCORING_RULES } from '@vighnaway/engine';
import { changeText, counterfactualOf, confidenceReasonsOf, reasonOf, recheckOf, ruleText, tradeOffOf, whatToDoNow } from '@/i18n/engineText';
import { setLanguage } from '@/i18n/lang';
import { getGraph } from '@/lib/engine';
import { phoneReceipt } from '@/lib/receipt';
import { buildShareText } from '@/lib/share';

/** The detailed engine sentences follow the phone's language (P0-2): rendered from structured text, not English. */

const demo = andheriScenario.demoTrip;
const place = (id: string) => andheriScenario.places.find((p) => p.id === id)!;

function plan(): PlanResult {
  return planTrip({
    graph: getGraph(andheriGraph, 'car'),
    origin: place(demo.originId).nodeId,
    destination: place(demo.destinationId).nodeId,
    incidents: [],
    nowS: 0,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: demo.destinationId,
  });
}
const rec = (p: PlanResult): RouteEvaluation => p.routes.find((r) => r.routeId === p.recommendedRouteId)!;

afterEach(() => setLanguage('en'));

describe('engine sentences in Hindi and Marathi', () => {
  it.each(['hi', 'mr'] as const)('the Why card is in %s, with no English engine sentence left', async (lang) => {
    const p = plan();
    const route = rec(p);
    setLanguage(lang);
    const { getByText } = await render(<WhyCard route={route} />);
    expect(getByText(renderText(route.explanation.reasonText!, lang))).toBeTruthy();
    expect(reasonOf(route)).not.toBe(route.explanation.reason);
    expect(recheckOf(route)).not.toBe(route.explanation.recheckIf);
    expect(reasonOf(route)).toBe(renderText(route.explanation.reasonText!, lang));
    for (const s of [reasonOf(route), tradeOffOf(route), recheckOf(route), ...confidenceReasonsOf(route)]) {
      expect(s).not.toMatch(/Fastest route|Avoids|Re-check|Alternative with|No recent reports|unverified/);
      expect(findForbiddenWords(s)).toEqual([]);
    }
  });

  it('English stays the engine string, unchanged', () => {
    const route = rec(plan());
    expect(reasonOf(route)).toBe(route.explanation.reason);
    expect(tradeOffOf(route)).toBe(route.explanation.tradeOff);
    expect(recheckOf(route)).toBe(route.explanation.recheckIf);
    expect(confidenceReasonsOf(route)).toEqual(route.explanation.confidenceReasons);
    expect(whatToDoNow(plan(), 'Hospital')).toMatch(/^Take /);
  });

  it.each(['hi', 'mr'] as const)('"Why not this route?" and "What to do now" are in %s', (lang) => {
    const p = plan();
    setLanguage(lang);
    const other = p.routes.find((r) => r.routeId !== p.recommendedRouteId);
    expect(other?.counterfactualText).toBeDefined();
    expect(counterfactualOf(other!)).toBe(renderText(other!.counterfactualText!, lang));
    expect(counterfactualOf(other!)).not.toMatch(/Would be recommended|Not viable/);
    expect(whatToDoNow(p, 'Hospital')).not.toMatch(/^Take /);
    expect(whatToDoNow(p, 'Hospital')).toContain('Hospital');
  });

  it('the scoring rules and formula are described in the active language', () => {
    expect(ruleText('switching', 'English')).toBe(SCORING_RULES.switching.description);
    setLanguage('hi');
    expect(ruleText('switching', 'English')).not.toBe('English');
    expect(ruleText('formula', 'English')).toMatch(/[ऀ-ॿ]/);
    setLanguage('mr');
    expect(ruleText('dataGap', 'English')).toMatch(/[ऀ-ॿ]/);
    expect(ruleText('not-a-rule', 'English')).toBe('English');
  });

  it('a route change banner reads in the active language', () => {
    const graph = getGraph(andheriGraph, 'car');
    const base = plan();
    const first = rec(base);
    const mid = graph.edges[graph.edgeIndex.get(first.edgeIds[Math.floor(first.edgeIds.length / 2)]!)!]!;
    const closure: Incident = {
      id: 'test:closure',
      scenarioId: andheriScenario.id,
      type: 'closure',
      status: 'verified',
      source: 'simulated',
      depth: null,
      congestion: null,
      severity: null,
      impassable: true,
      conflicting: false,
      edgeIds: [mid.baseId],
      point: { lat: 19.1, lng: 72.85 },
      roadName: mid.name,
      reportCount: 1,
      deviceCount: 1,
      createdAtS: 0,
      lastReportAtS: 0,
      updatedAtS: 0,
      verifiedAtS: 0,
      verifiedBy: 'simulated_operator',
      closedAtS: null,
      linkedIncidentId: null,
      note: null,
      seq: 1,
    };
    const changed = planTrip({
      graph,
      origin: place(demo.originId).nodeId,
      destination: place(demo.destinationId).nodeId,
      incidents: [closure],
      nowS: 0,
      alerts: andheriScenario.alerts,
      hasAlertInformation: andheriScenario.hasAlertInformation,
      previousRecommendation: { routeId: first.routeId, edgeIds: first.edgeIds },
      places: andheriScenario.places,
      destinationPlaceId: demo.destinationId,
    });
    expect(changed.change).toBeTruthy();
    expect(changeText(changed)!.message).toMatch(/^Route changed/);
    setLanguage('hi');
    const hi = changeText(changed)!;
    expect(hi.message).toMatch(/[ऀ-ॿ]/);
    expect(hi.message).not.toMatch(/Route changed|New route/);
    if (hi.tradeOff) expect(hi.tradeOff).not.toMatch(/compared with/);
  });
});

describe('share text with a decision receipt (P1-2.c)', () => {
  const graph = getGraph(andheriGraph, 'car');
  const base = () => {
    const p = plan();
    return { plan: p, route: rec(p), placeName: 'Hospital', graph, incidents: {}, clockStartsAt: andheriScenario.clockStartsAt, etaS: rec(p).etaS };
  };
  const receipt = (consoleUrl: string) =>
    phoneReceipt({ scenario: andheriScenario, graph, incidents: [], seq: 0, nowS: 0, originId: demo.originId, destinationId: demo.destinationId, consoleUrl });

  it('adds the receipt hash and a verify link, keeps the Simulated label, and the link verifies', () => {
    const r = receipt('https://console.example/')!;
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
    const text = buildShareText({ ...base(), receipt: r });
    expect(text).toMatch(/Simulated scenario/);
    expect(text).toContain(`Decision receipt: ${r.hash}`);
    expect(text).toContain(`Verify it: https://console.example/verify?r=`);
    expect(findForbiddenWords(text)).toEqual([]);
    const decoded = decodeReceipt(r.url!.split('?r=')[1]!)!;
    expect(decoded.planHash.startsWith(r.hash)).toBe(true);
    expect(decoded.simulated).toBe(true);
    expect(decoded.seq).toBe(0);
  });

  it('has no link without a console address, and no receipt lines while following a route', () => {
    const noLink = buildShareText({ ...base(), receipt: receipt('') });
    expect(noLink).toMatch(/Decision receipt: [0-9a-f]{8}/);
    expect(noLink).not.toMatch(/Verify it/);
    expect(buildShareText({ ...base(), receipt: null })).not.toMatch(/Decision receipt/);
  });

  it('reads in Hindi', () => {
    setLanguage('hi');
    const text = buildShareText({ ...base(), receipt: receipt('https://console.example') });
    expect(text).toMatch(/निर्णय रसीद: [0-9a-f]{8}/);
  });
});
