import { describe, expect, it } from 'vitest';
import { ASK_COOLDOWN_MS, dataGapQuestions, haversineM, loadGraph, nextQuestion, planTrip } from '../src';
import type { DataGapQuestion } from '../src';
import { andheriGraph, edgesNamed, incident, noAlerts, place, rainAlert } from './helpers';

const car = loadGraph(andheriGraph, 'car');
const base = { graph: car, origin: place('origin-marol').nodeId, destination: place('hosp-kokilaben').nodeId, nowS: 100 };
const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');

describe('ask the crowd at data gaps', () => {
  it('turns the data-gap roads on the recommended route into questions, in route order', () => {
    const plan = planTrip({ ...base, incidents: [], ...rainAlert });
    const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId)!;
    expect(rec.dataGaps.length).toBeGreaterThan(0);
    const qs = dataGapQuestions(plan, car);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0]!.roadName).toBe('Andheri Subway');
    expect(qs.map((q) => q.positionM)).toEqual([...qs.map((q) => q.positionM)].sort((a, b) => a - b));
    expect(new Set(qs.map((q) => q.key)).size).toBe(qs.length);
    // The report point sits on the road the question names.
    const edge = car.edges[car.edgeIndex.get(qs[0]!.edgeId)!]!;
    const [lng, lat] = edge.geometry[0]!;
    expect(haversineM({ lat, lng }, qs[0]!.point)).toBeLessThan(edge.lengthM);
  });

  it('asks nothing without a rain alert (no data gap), or when a recent report already covers the road', () => {
    expect(dataGapQuestions(planTrip({ ...base, incidents: [], ...noAlerts }), car)).toEqual([]);
    const covered = incident({ type: 'flood', depth: 'ankle', edgeIds: SUBWAY, lastReportAtS: 90, roadName: 'Andheri Subway' });
    const plan = planTrip({ ...base, incidents: [covered], ...rainAlert });
    expect(dataGapQuestions(plan, car).some((q) => q.roadName === 'Andheri Subway')).toBe(false);
  });

  it('asks nothing when there is no viable route', () => {
    const closed = incident({ type: 'closure', status: 'verified', edgeIds: edgesNamed(andheriGraph, 'Rao Saheb Achyutrao Patwardhan Marg') });
    const plan = planTrip({ ...base, incidents: [closed], ...rainAlert });
    if (plan.noViableRoute) expect(dataGapQuestions(plan, car)).toEqual([]);
  });

  it('at most one prompt per road per device per 30 minutes, and never while moving faster than walking', () => {
    const q = (key: string): DataGapQuestion => ({ key, roadName: key, edgeId: key, point: { lat: 0, lng: 0 }, positionM: 0 });
    const qs = [q('A'), q('B')];
    const state = { askedAtMs: {}, nowMs: 1_000_000, movingFasterThanWalking: false };
    expect(nextQuestion(qs, state)?.key).toBe('A');
    // A was just asked: the next road is offered instead.
    expect(nextQuestion(qs, { ...state, askedAtMs: { A: state.nowMs } })?.key).toBe('B');
    expect(nextQuestion(qs, { ...state, askedAtMs: { A: state.nowMs, B: state.nowMs } })).toBeNull();
    // Exactly 30 minutes later the road may be asked again; one millisecond earlier it may not.
    const asked = { A: state.nowMs, B: state.nowMs };
    expect(nextQuestion(qs, { ...state, askedAtMs: asked, nowMs: state.nowMs + ASK_COOLDOWN_MS - 1 })).toBeNull();
    expect(nextQuestion(qs, { ...state, askedAtMs: asked, nowMs: state.nowMs + ASK_COOLDOWN_MS })?.key).toBe('A');
    expect(nextQuestion(qs, { ...state, movingFasterThanWalking: true })).toBeNull();
    expect(nextQuestion([], state)).toBeNull();
  });
});
