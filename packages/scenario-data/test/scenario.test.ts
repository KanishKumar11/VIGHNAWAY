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

  it('the demo trip has three distinctly named routes, A then B then C, 2 to 6 minutes apart, with no incidents', () => {
    const car = loadGraph(andheriGraph, 'car');
    const o = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
    const d = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
    const p = planTrip({ graph: car, origin: o.nodeId, destination: d.nodeId, incidents: [], nowS: 0, alerts: [], hasAlertInformation: true });
    expect(p.routes.map((r) => r.name)).toEqual(['Via Andheri Subway', 'Via Balasaheb Thackeray Flyover', 'Via Ceasar Road']);
    const [a, b, c] = p.routes.map((r) => r.etaS) as [number, number, number];
    for (const gap of [b - a, c - b]) {
      expect(gap).toBeGreaterThanOrEqual(120);
      expect(gap).toBeLessThanOrEqual(360);
    }
  });

  it('the subway is flood-prone on the real graph, so the first route carries a data gap during the rain alert', () => {
    const subway = andheriGraph.edges.filter((e) => e.name === 'Andheri Subway');
    expect(subway.length).toBeGreaterThan(0);
    expect(subway.every((e) => e.floodProne && e.tunnel)).toBe(true);
    const { initialPlan } = replayScenario(andheriScenario, andheriGraph);
    const first = initialPlan.routes[0]!;
    expect(first.dataGaps).toHaveLength(1);
    expect(first.dataGaps[0]!.roadName).toBe('Andheri Subway');
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
    expect(byEvent('ev02-knee').recommended).toBe('Via G K Gokhale Flyover');
    expect(byEvent('ev02-knee').text).toContain('Flooding (knee deep) at Andheri Subway');
    expect(byEvent('ev03-verify').recommended).toBe('Via G K Gokhale Flyover');
    expect(byEvent('ev04-congestion-a').recommended).toBe('Via G K Gokhale Flyover');
    expect(byEvent('ev05-congestion-b').recommended).toBe('Via Balasaheb Thackeray Flyover');
    expect(byEvent('ev05-congestion-b').text).toContain('Heavy congestion on G K Gokhale Flyover');
    expect(byEvent('ev07-verify-closure').text).toContain('switching destination to HBT Trauma Care Hospital');
  });

  it('reset then replay gives identical event logs and engine outputs', () => {
    expect(run().log).toEqual(run().log);
  });
});
