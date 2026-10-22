import { describe, expect, it } from 'vitest';
import { GraphFileSchema, ScenarioSchema } from '@vighnaway/contracts';
import { loadGraph, planTrip } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '../src';
import { replayScenario } from '../scripts/replay';

describe('andheri data', () => {
  it('graph and scenario validate against the contracts', () => {
    expect(GraphFileSchema.safeParse(andheriGraph).success).toBe(true);
    expect(ScenarioSchema.safeParse(andheriScenario).success).toBe(true);
    expect(andheriScenario.graphVersion).toBe(andheriGraph.graphVersion);
  });

  it('every two-way edge has a reverse twin with reversed geometry', () => {
    const byId = new Map(andheriGraph.edges.map((e) => [e.id, e] as const));
    for (const e of andheriGraph.edges) {
      if (e.reverseId === null) continue;
      const r = byId.get(e.reverseId)!;
      expect(r.from).toBe(e.to);
      expect(r.geometry[0]).toEqual(e.geometry[e.geometry.length - 1]);
    }
  });

  it('A beats B and B beats C by 4 to 6 minutes each, with no incidents', () => {
    const car = loadGraph(andheriGraph, 'car');
    const o = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
    const d = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
    const p = planTrip({ graph: car, origin: o.nodeId, destination: d.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
    const eta = Object.fromEntries(p.routes.map((r) => [r.name, r.etaS]));
    const a = eta['Via Andheri Subway']!;
    const b = eta['Via Gokhale Bridge']!;
    const c = eta['Via Jogeshwari Road Over Bridge']!;
    for (const gap of [b - a, c - b]) {
      expect(gap).toBeGreaterThanOrEqual(240);
      expect(gap).toBeLessThanOrEqual(360);
    }
  });
});

describe('scripted demo replay (offline approximation of the API rules)', () => {
  const run = () => replayScenario(andheriScenario, andheriGraph);

  it('produces the three proofs in order', () => {
    const { log } = run();
    const byEvent = (prefix: string) => log.find((l) => l.text.startsWith(prefix))!;
    expect(log[0]!.recommended).toBe('Via Andheri Subway');
    expect(byEvent('ev01-ankle').text).toContain('Route unchanged: one unverified report');
    expect(byEvent('ev01-ankle').recommended).toBe('Via Andheri Subway');
    expect(byEvent('ev02-knee').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev02-knee').vehicleRoadName).toBe('Andheri-Kurla Road');
    expect(byEvent('ev03-verify').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev04-congestion-a').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev05-congestion-b').recommended).toBe('Via Jogeshwari Road Over Bridge');
    expect(byEvent('ev05-congestion-b').vehicleRoadName).toBe('Western Express Highway');
    expect(byEvent('ev07-verify-closure').text).toContain('switching destination to HBT Trauma Care Hospital');
  });

  it('reset then replay gives identical event logs and engine outputs', () => {
    expect(run().log).toEqual(run().log);
  });
});
