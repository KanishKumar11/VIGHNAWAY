import { describe, expect, it } from 'vitest';
import { buildIncidentIndex, loadGraph, planTrip } from '../src';
import { hashValue, stripText } from '../src/hash';
import { andheriGraph, andheriScenario, incident, place } from './helpers';

/** P2-8: a walking concern is display only. The engine never lets it reach routing, data gaps or the incident count. */

const graph = loadGraph(andheriGraph, 'car');
const input = {
  graph,
  origin: place(andheriScenario.demoTrip.originId).nodeId,
  destination: place(andheriScenario.demoTrip.destinationId).nodeId,
  nowS: 0,
  alerts: andheriScenario.alerts,
  hasAlertInformation: andheriScenario.hasAlertInformation,
};
const base = planTrip({ ...input, incidents: [] });
const edge = base.routes[0]!.edgeIds[1]!;

describe('walking concern incidents', () => {
  const concern = (status: 'unverified' | 'verified' | 'corroborated', concernKind: 'poorly_lit' | 'isolated' = 'poorly_lit') =>
    incident({ type: 'walking_concern', concern: concernKind, status, edgeIds: [edge], lastReportAtS: 0 });

  it('leave the plan unchanged at every status, byte for byte', () => {
    const want = hashValue(stripText(base));
    for (const status of ['unverified', 'corroborated', 'verified'] as const) {
      const plan = planTrip({ ...input, incidents: [concern(status), concern(status, 'isolated')] });
      expect(hashValue(stripText(plan))).toBe(want);
      expect(plan.incidentCount).toBe(0);
    }
  });

  it('are not in the incident index, so they cannot cover a data gap or raise a hazard', () => {
    const index = buildIncidentIndex([concern('verified')]);
    expect(index.sorted).toHaveLength(0);
    expect(index.openByEdge.size).toBe(0);
    expect(index.lastReportByEdge.size).toBe(0);
  });

  it('do not disturb a real incident that is alongside them', () => {
    const flood = incident({ type: 'flood', depth: 'knee', status: 'verified', edgeIds: [edge], lastReportAtS: 0 });
    const alone = planTrip({ ...input, incidents: [flood] });
    const mixed = planTrip({ ...input, incidents: [flood, concern('verified')] });
    expect(hashValue(stripText(mixed))).toBe(hashValue(stripText(alone)));
  });
});
