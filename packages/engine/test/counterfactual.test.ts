import { describe, expect, it } from 'vitest';
import type { Incident, PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import { exceedsSwitchThreshold, loadGraph, planTrip, renderText, TEXT_LANGS } from '../src';
import { andheriGraph, edgesNamed, incident, noAlerts, place } from './helpers';

const car = loadGraph(andheriGraph, 'car');
const base = { graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, nowS: 0, ...noAlerts };
const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');
const AKR = edgesNamed(andheriGraph, 'Andheri-Kurla Road');

const plan = (incidents: Incident[], previous?: RouteEvaluation) =>
  planTrip({ ...base, incidents, ...(previous ? { previousRecommendation: { routeId: previous.routeId, edgeIds: previous.edgeIds } } : {}) });
const rec = (p: PlanResult) => p.routes.find((r) => r.routeId === p.recommendedRouteId)!;
const others = (p: PlanResult) => p.routes.filter((r) => r.routeId !== p.recommendedRouteId);

const subwayClosed = () => incident({ id: 'cf:closure', type: 'closure', status: 'verified', edgeIds: SUBWAY, roadName: 'Andheri Subway' });
const subwayFlood = () => incident({ id: 'cf:flood', type: 'flood', depth: 'knee', status: 'unverified', edgeIds: SUBWAY, roadName: 'Andheri Subway' });

describe('counterfactuals: why not that route?', () => {
  it('the recommended route has none; every other shown route has one', () => {
    for (const incidents of [[], [subwayClosed()], [subwayFlood()]]) {
      const p = plan(incidents);
      expect(rec(p).counterfactual).toBeUndefined();
      expect(rec(p).counterfactualText).toBeUndefined();
      for (const r of others(p)) {
        expect(r.counterfactual, r.name).toBeDefined();
        expect(r.counterfactualText, r.name).toBeDefined();
      }
    }
  });

  it('blocked: names the blocking incident, and a faster ETA never counts', () => {
    const p = plan([subwayClosed()]);
    const blocked = p.routes.find((r) => !r.viable)!;
    expect(blocked.counterfactual).toEqual({ kind: 'blocked', blockerIds: ['cf:closure'], wouldBeRecommended: true });
    expect(renderText(blocked.counterfactualText!, 'en')).toBe(
      'Would be recommended if road closure at Andheri Subway were cleared.',
    );
  });

  it('hazard-penalised: one hazard whose clearing flips the ranking is the smallest change', () => {
    const p = plan([subwayFlood()]);
    const penalised = p.routes.find((r) => r.hazards.some((h) => h.incidentId === 'cf:flood'))!;
    expect(penalised.viable).toBe(true);
    expect(penalised.counterfactual).toEqual({ kind: 'hazards', incidentIds: ['cf:flood'], smallest: true });
    expect(renderText(penalised.counterfactualText!, 'en')).toBe(
      'Would be recommended if flooding (knee deep) at Andheri Subway were cleared.',
    );
  });

  it('slower only: says how much faster the route would have to be', () => {
    const p = plan([]);
    const slower = others(p).filter((r) => r.viable);
    expect(slower.length).toBeGreaterThan(0);
    for (const r of slower) {
      expect(r.counterfactual?.kind).toBe('time');
      const cut = (r.counterfactual as { cutS: number }).cutS;
      const gap = r.costS - rec(p).costS;
      // Without a previous route the cheapest wins: a cut of the gap ties (broken by distance, then id), one more always wins.
      expect([gap, gap + 1]).toContain(cut);
      expect(renderText(r.counterfactualText!, 'en')).toBe(`Would be recommended if it were ${Math.ceil(cut / 60)} min faster.`);
    }
  });

  it('time cut follows the switching threshold when a route is being followed', () => {
    const first = plan([]);
    const current = rec(first);
    const p = plan([], current);
    expect(p.recommendedRouteId).toBe(current.routeId);
    for (const r of others(p).filter((x) => x.counterfactual?.kind === 'time')) {
      const cut = (r.counterfactual as { cutS: number }).cutS;
      expect(exceedsSwitchThreshold(current.costS, current.costS - (r.costS - cut))).toBe(true);
      expect(exceedsSwitchThreshold(current.costS, current.costS - (r.costS - (cut - 1)))).toBe(false);
    }
  });

  it('two hazards: more than one incident must be cleared together', () => {
    const a = incident({ id: 'cf:a', type: 'flood', depth: 'knee', status: 'unverified', edgeIds: SUBWAY, roadName: 'Andheri Subway' });
    const b = incident({ id: 'cf:b', type: 'closure', status: 'unverified', edgeIds: SUBWAY, roadName: 'Andheri Subway' });
    const p = plan([a, b]);
    const r = p.routes.find((x) => x.hazards.some((h) => h.incidentId === 'cf:a') && x.hazards.some((h) => h.incidentId === 'cf:b'));
    expect(r).toBeDefined();
    const cf = r!.counterfactual!;
    // Either one alone is enough, or only both together are; a set is never called the smallest.
    if (cf.kind === 'hazards') expect(cf.smallest).toBe(cf.incidentIds.length === 1);
    expect(['hazards', 'time', 'none_sufficient']).toContain(cf.kind);
  });

  it('property: applying the stated change in a fresh planTrip makes the route the recommendation', () => {
    const sets: Incident[][] = [
      [subwayClosed()],
      [subwayFlood()],
      [subwayFlood(), incident({ id: 'cf:jam', type: 'congestion', congestion: 'heavy', status: 'verified', edgeIds: AKR, roadName: 'Andheri-Kurla Road' })],
      [subwayClosed(), incident({ id: 'cf:jam2', type: 'congestion', congestion: 'heavy', status: 'verified', edgeIds: AKR, roadName: 'Andheri-Kurla Road' })],
    ];
    let checked = 0;
    for (const incidents of sets) {
      const p = plan(incidents);
      for (const r of others(p)) {
        const cf = r.counterfactual!;
        const cleared = cf.kind === 'blocked' && cf.wouldBeRecommended ? cf.blockerIds : cf.kind === 'hazards' ? cf.incidentIds : null;
        if (!cleared) continue;
        const after = plan(incidents.map((i) => (cleared.includes(i.id) ? { ...i, status: 'resolved' as const } : i)));
        expect(after.recommendedRouteId, `${r.name}: ${JSON.stringify(cf)}`).toBe(r.routeId);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('is deterministic and renders in en, hi and mr without forbidden words or leftover placeholders', () => {
    const p = plan([subwayFlood()]);
    expect(JSON.stringify(plan([subwayFlood()]).routes.map((r) => r.counterfactual))).toBe(JSON.stringify(p.routes.map((r) => r.counterfactual)));
    for (const incidents of [[], [subwayClosed()], [subwayFlood()]]) {
      for (const r of others(plan(incidents))) {
        for (const lang of TEXT_LANGS) {
          const s = renderText(r.counterfactualText!, lang);
          expect(s).not.toMatch(/\{\w+(\|\w+)?\}/);
          expect(findForbiddenWords(s)).toEqual([]);
        }
      }
    }
  });
});
