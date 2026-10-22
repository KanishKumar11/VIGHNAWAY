import { describe, expect, it } from 'vitest';
import { alertContext, flowDurationMs, loadGraph, nextAction, planTrip, routeFlow, spokenChange } from '../src';
import { andheriGraph, andheriScenario, edgesNamed, incident, noAlerts, place } from './helpers';

const car = loadGraph(andheriGraph, 'car');
const base = { graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, nowS: 0, ...noAlerts };
const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');
const AKR = edgesNamed(andheriGraph, 'Andheri-Kurla Road');

describe('presentation helpers', () => {
  it('routeFlow slows congested segments and stops blocked ones', () => {
    const p = planTrip({ ...base, incidents: [] });
    const route = p.routes[0]!;
    const ctx = alertContext([], true, 0);
    const free = routeFlow(car, route.edgeIds, [], ctx);
    const jammed = routeFlow(car, route.edgeIds, [incident({ type: 'congestion', congestion: 'heavy', status: 'verified', edgeIds: AKR })], ctx);
    const i = route.edgeIds.findIndex((id) => AKR.includes(id));
    expect(jammed[i]!.slowdown).toBe(2.5);
    expect(jammed[i]!.speedKmh).toBeCloseTo(free[i]!.speedKmh / 2.5, 0);
    const blocked = routeFlow(car, route.edgeIds, [incident({ type: 'closure', status: 'verified', edgeIds: SUBWAY })], ctx);
    expect(blocked.find((s) => SUBWAY.includes(s.edgeId))!.blocked).toBe(true);
    expect(flowDurationMs({ speedKmh: 0, blocked: true })).toBeNull();
    expect(flowDurationMs({ speedKmh: 12, blocked: false })!).toBeGreaterThan(flowDurationMs({ speedKmh: 40, blocked: false })!);
  });

  it('nextAction says what to do in one sentence', () => {
    expect(nextAction(planTrip({ ...base, incidents: [] }), 'Kokilaben Hospital')).toBe('Take Andheri Subway to Kokilaben Hospital, 16 min.');
    const none = planTrip({
      ...base,
      incidents: [incident({ type: 'closure', status: 'verified', edgeIds: edgesNamed(andheriGraph, 'Rao Saheb Achyutrao Patwardhan Marg') })],
      places: andheriScenario.places,
      destinationPlaceId: 'hosp-kokilaben',
    });
    expect(nextAction(none)).toMatch(/^No viable route\. Head to .+\. In an emergency, call 112\.$/);
  });

  it('spokenChange reads naturally', () => {
    const prev = planTrip({ ...base, incidents: [] }).routes[0]!;
    const p = planTrip({
      ...base,
      incidents: [incident({ type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, edgeIds: SUBWAY, roadName: 'Andheri Subway' })],
      previousRecommendation: { routeId: prev.routeId, edgeIds: prev.edgeIds },
    });
    expect(spokenChange(p)).toBe(
      'Route changed. Flooding knee deep at Andheri Subway, Corroborated by 2 devices, Simulated. New route via Gokhale Bridge adds 5 minutes.',
    );
    expect(spokenChange(planTrip({ ...base, incidents: [] }))).toBeNull();
  });
});
