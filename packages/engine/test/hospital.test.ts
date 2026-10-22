import { describe, expect, it } from 'vitest';
import { alertContext, assignHospitals, hospitalStateCostS, loadGraph, SCORING_RULES, type HospitalAssignment } from '../src';
import { andheriGraph, andheriScenario, edgesNamed, incident, noAlerts, place } from './helpers';

/** P2-4.b: hospital load spreading is deterministic, ranking only, and never assigns an unreachable hospital. */

const car = loadGraph(andheriGraph, 'car');
const ctx = alertContext(noAlerts.alerts, noAlerts.hasAlertInformation, 0);
const origin = place('origin-marol').nodeId;
const trips = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${String(i).padStart(2, '0')}`, origin }));
const run = (n: number, states: Record<string, 'accepting' | 'busy' | 'diverting'> = {}, incidents = [] as ReturnType<typeof incident>[]) =>
  assignHospitals({ graph: car, trips: trips(n), places: andheriScenario.places, states, incidents, ctx });
const ids = (xs: HospitalAssignment[]) => xs.map((a) => a.placeId);

describe('assignHospitals', () => {
  it('gives a single trip the hospital with the shortest arrival time', () => {
    const [a] = run(1);
    expect(a!.reason).toBe('nearest');
    expect(a!.passedOver).toBeNull();
    expect(a!.etaS).toBeGreaterThan(0);
  });

  it('spreads trips: each trip already assigned to a hospital adds a cost, so later trips go elsewhere', () => {
    const out = run(8);
    expect(new Set(ids(out)).size).toBeGreaterThan(1);
    expect(out[0]!.reason).toBe('nearest');
    expect(out.some((a) => a.reason === 'spread')).toBe(true);
    // The arrival time reported is the real one for the assigned hospital, not the ranking cost.
    for (const a of out) expect(a.etaS).not.toBeNull();
  });

  it('is deterministic and independent of the order the trips are given in', () => {
    const a = run(6);
    const reversed = assignHospitals({ graph: car, trips: [...trips(6)].reverse(), places: andheriScenario.places, states: {}, incidents: [], ctx });
    expect(reversed).toEqual(a);
    expect(run(6)).toEqual(a);
  });

  it('a busy or diverting hospital is passed over when another is close enough, and the reason says so', () => {
    const first = run(1)[0]!;
    const nearest = first.placeId!;
    const diverting = run(1, { [nearest]: 'diverting' })[0]!;
    expect(diverting.placeId).not.toBe(nearest);
    expect(diverting.reason).toBe('spread');
    expect(diverting.passedOver).toMatchObject({ placeId: nearest, state: 'diverting' });
    const busy = run(1, { [nearest]: 'busy' })[0]!;
    // Busy costs 300 s: it is passed over only if another hospital is within that margin.
    expect(busy.placeId === nearest || busy.passedOver?.state === 'busy').toBe(true);
  });

  it('state penalties are the documented ones and are ranking only', () => {
    expect(hospitalStateCostS('accepting')).toBe(0);
    expect(hospitalStateCostS('busy')).toBe(SCORING_RULES.hospitalLoad.value.busyS);
    expect(hospitalStateCostS('diverting')).toBe(SCORING_RULES.hospitalLoad.value.divertingS);
    const nearest = run(1)[0]!;
    const withState = run(1, { [nearest.placeId!]: 'busy' })[0]!;
    if (withState.placeId === nearest.placeId) expect(withState.etaS).toBe(nearest.etaS);
  });

  it('when every hospital is diverting a hospital is still assigned', () => {
    const all = Object.fromEntries(andheriScenario.places.filter((p) => p.kind === 'hospital').map((p) => [p.id, 'diverting' as const]));
    const [a] = run(1, all);
    expect(a!.placeId).not.toBeNull();
  });

  it('never assigns a hospital that is not reachable: a verified closure on its only road', () => {
    const road = edgesNamed(andheriGraph, 'Rao Saheb Achyutrao Patwardhan Marg');
    const closure = incident({ type: 'closure', status: 'verified', edgeIds: road, impassable: true });
    const [a] = run(1, {}, [closure]);
    expect(a!.placeId).not.toBe('hosp-kokilaben');
    const none = assignHospitals({ graph: car, trips: [{ id: 't', origin: 'no-such-node' }], places: andheriScenario.places, states: {}, incidents: [], ctx });
    expect(none[0]).toMatchObject({ placeId: null, etaS: null, reason: 'none' });
  });
});
