import { describe, expect, it } from 'vitest';
import type { Incident, TripPosition } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import {
  createTrip,
  followedDisplayEdges,
  incidentsTrip,
  positionTrip,
  recommendedRoute,
  tickTrip,
  vehicleMarker,
  type TripEnv,
  type TripState,
} from '@/lib/demoTrip';
import { graphFor } from '@/lib/scenario';
import { makeIncident, scenarioEvent } from './helpers';

const env: TripEnv = { graph: graphFor(andheriScenario.demoTrip.profile), scenario: andheriScenario };
const recName = (s: TripState) => recommendedRoute(s.plan)?.name ?? null;

function runTo(s: TripState, toS: number, incidents: Incident[]): TripState {
  let cur = s;
  for (let t = cur.simTimeS + 10; t <= toS; t += 10) cur = tickTrip(env, cur, t, incidents);
  return cur;
}

describe('demo trip follower (same decisions as the scripted replay)', () => {
  const subway = scenarioEvent(andheriScenario, 'ev01-ankle').report.point;
  const nagardas = scenarioEvent(andheriScenario, 'ev04-congestion-a').report.point;
  const hospitalRoad = scenarioEvent(andheriScenario, 'ev06-closure').report.point;

  it('starts on the usual fastest route via Andheri Subway with Low confidence (another route is within a minute)', () => {
    const s = createTrip(env, [], 0);
    expect(s.mode).toBe('local');
    expect(recName(s)).toBe('Via Andheri Subway');
    expect(recommendedRoute(s.plan)!.explanation.confidence).toBe('low');
    expect(recommendedRoute(s.plan)!.dataGaps.map((g) => g.roadName)).toEqual(['Andheri Subway']);
    expect(vehicleMarker(env, s)).not.toBeNull();
  });

  it('plays the event script: unchanged, Gokhale, Balasaheb Thackeray, then the nearest reachable hospital', () => {
    let s = createTrip(env, [], 0);
    let incidents: Incident[] = [];

    s = runTo(s, 60, incidents);
    const flood = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'ankle', point: subway, createdAtS: 60, lastReportAtS: 60, updatedAtS: 60, seq: 1 });
    incidents = [flood];
    s = incidentsTrip(env, s, incidents, 60);
    expect(s.change).toBeNull();
    expect(recName(s)).toBe('Via Andheri Subway');
    expect(s.notice?.message).toBe('Route unchanged: one unverified report');

    s = runTo(s, 180, incidents);
    incidents = [{ ...flood, depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 180, updatedAtS: 180, seq: 2 }];
    s = incidentsTrip(env, s, incidents, 180);
    expect(recName(s)).toBe('Via G K Gokhale Flyover');
    expect(s.change?.id).toBe(1);
    expect(s.change?.message).toBe(
      'Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via G K Gokhale Flyover adds 4 min.',
    );
    expect(s.change?.blockingEdgeIds.length).toBeGreaterThan(0);
    expect(s.change?.triggerIncidentId).toBe('inc-flood');

    s = runTo(s, 270, incidents);
    incidents = [{ ...incidents[0]!, status: 'verified', verifiedAtS: 270, verifiedBy: 'simulated_operator', updatedAtS: 270, seq: 3 }];
    const beforeVerify = s.changeCount;
    s = incidentsTrip(env, s, incidents, 270);
    expect(s.changeCount).toBe(beforeVerify);
    expect(recName(s)).toBe('Via G K Gokhale Flyover');

    s = runTo(s, 360, incidents);
    const jam = makeIncident({ id: 'inc-jam', type: 'congestion', congestion: 'heavy', point: nagardas, createdAtS: 360, lastReportAtS: 360, updatedAtS: 360, seq: 4 });
    incidents = [incidents[0]!, jam];
    s = incidentsTrip(env, s, incidents, 360);
    expect(recName(s)).toBe('Via G K Gokhale Flyover');

    s = runTo(s, 370, incidents);
    incidents = [incidents[0]!, { ...jam, status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 370, updatedAtS: 370, seq: 5 }];
    s = incidentsTrip(env, s, incidents, 370);
    expect(recName(s)).toBe('Via Balasaheb Thackeray Flyover');
    expect(s.change?.id).toBe(2);
    expect(s.change?.message).toContain('Heavy congestion on G K Gokhale Flyover: Corroborated (2 devices), Simulated.');

    s = runTo(s, 480, incidents);
    const closure = makeIncident({ id: 'inc-closure', type: 'closure', point: hospitalRoad, createdAtS: 480, lastReportAtS: 480, updatedAtS: 480, seq: 6 });
    incidents = [...incidents, closure];
    s = incidentsTrip(env, s, incidents, 480);
    expect(s.changeCount).toBe(2);

    s = runTo(s, 490, incidents);
    incidents = [incidents[0]!, incidents[1]!, { ...closure, status: 'verified', verifiedAtS: 490, verifiedBy: 'simulated_operator', updatedAtS: 490, seq: 7 }];
    s = incidentsTrip(env, s, incidents, 490);
    expect(s.destinationId).toBe('hosp-hbt');
    expect(s.change?.kind).toBe('destination');
    expect(s.change?.message).toContain('Nearest reachable: HBT Trauma Care Hospital');

    s = runTo(s, 2000, incidents);
    expect(s.arrived).toBe(true);
  });

  it('is idempotent: unchanged incidents never change the recommendation', () => {
    const flood = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'ankle', point: subway, lastReportAtS: 0, updatedAtS: 0 });
    const a = incidentsTrip(env, createTrip(env, [], 0), [flood], 0);
    const b = incidentsTrip(env, a, [flood], 0);
    expect(b).toBe(a);
  });

  it('uses the phone position once trip.position arrives and re-plans from its edge', () => {
    let s = createTrip(env, [], 0);
    const rec = recommendedRoute(s.plan)!;
    const pos: TripPosition = {
      scenarioId: andheriScenario.id,
      routeId: rec.routeId,
      coordinate: { lat: 19.1322, lng: 72.8416 },
      headingDeg: 270,
      simTimeS: 100,
      edgeId: rec.edgeIds[1]!,
      edgeFraction: 0.5,
      profile: 'car',
      destinationId: andheriScenario.demoTrip.destinationId,
      edgeIds: rec.edgeIds,
      travelledEdgeCount: 1,
      status: 'en_route',
    };
    s = positionTrip(env, s, pos);
    expect(s.mode).toBe('phone');
    expect(vehicleMarker(env, s)).toEqual({ lat: 19.1322, lng: 72.8416, headingDeg: 270 });
    expect(followedDisplayEdges(s)[0]).toBe(rec.edgeIds[1]);

    const flood = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, point: subway, lastReportAtS: 180, updatedAtS: 180 });
    s = incidentsTrip(env, s, [flood], 180);
    expect(recName(s)).toBe('Via G K Gokhale Flyover');
    expect(s.plan.vehicle?.edgeId).toBe(rec.edgeIds[1]);
  });

  it('plans from the origin without a vehicle when opened mid-run with no phone', () => {
    const s = createTrip(env, [], 600);
    expect(s.mode).toBe('origin');
    expect(vehicleMarker(env, s)).toBeNull();
  });
});
