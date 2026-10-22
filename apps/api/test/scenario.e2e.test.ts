/**
 * End-to-end: the scripted scenario stepped through the real sim endpoints (so every event goes
 * through ReportsService / IncidentsService and PostGIS), then the engine planned on the API's
 * incident snapshot exactly like packages/scenario-data/scripts/replay.ts does. The API never
 * plans routes; the engine is imported here only to check the outcomes.
 */
import {
  type Incident,
  IncidentsResponseSchema,
  type PlanResult,
  SimResponseSchema,
} from '@vighnaway/contracts';
import {
  advanceVehicle,
  alertContext,
  followPlan,
  loadGraph,
  planHash,
  planTrip,
  replanFrom,
  startVehicle,
  type VehicleState,
  vehiclePosition,
} from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replayScenario } from '../../../packages/scenario-data/scripts/replay';
import { AUTH, connect, join, resetScenario, SID, startApp, type TestApp } from './helpers';

interface LogEntry {
  atS: number;
  eventIds: string[];
  recommended: string | null;
  vehicleRoadName: string | null;
  hash: string;
  change: string;
  destination: string;
}

interface RunResult {
  log: LogEntry[];
  incidents: Incident[];
  resetSeq: number;
  runId: string;
  upserts: number[];
}

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});

const scenario = andheriScenario;
const graph = loadGraph(andheriGraph, scenario.demoTrip.profile);
const placeById = new Map(scenario.places.map((p) => [p.id, p]));
const edgeName = (id: string | null) => {
  if (!id) return null;
  const i = graph.edgeIndex.get(id);
  return i === undefined ? null : graph.edges[i]!.name;
};

async function snapshot(): Promise<{ incidents: Incident[]; seq: number }> {
  const body = IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);
  expect(body.full).toBe(true);
  return { incidents: body.incidents, seq: body.seq };
}

/** Drives the demo trip like replay.ts, but every event goes through POST /sim/step. */
async function runScenario(): Promise<RunResult> {
  const resetSeq = await resetScenario(t);
  const socket = await connect(t);
  const joined = await join(socket);
  expect(joined.ok).toBe(true);
  const stepS = 5;
  const untilS = 1800;
  const origin = placeById.get(scenario.demoTrip.originId)!;
  let destination = placeById.get(scenario.demoTrip.destinationId)!;
  let incidents: Incident[] = [];
  const conditions = (nowS: number) => ({
    incidents,
    nowS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
  });
  let plan: PlanResult = planTrip({
    graph,
    origin: origin.nodeId,
    destination: destination.nodeId,
    ...conditions(0),
    places: scenario.places,
    destinationPlaceId: destination.id,
  });
  const log: LogEntry[] = [];
  const record = (atS: number, eventIds: string[], p: PlanResult, v: VehicleState | null) => {
    const rec = p.routes.find((r) => r.routeId === p.recommendedRouteId) ?? null;
    const pos = v ? vehiclePosition(graph, v) : null;
    log.push({
      atS,
      eventIds,
      recommended: rec?.name ?? null,
      vehicleRoadName: edgeName(pos?.edgeId ?? null),
      hash: planHash(p),
      change: p.change?.message ?? p.notices.map((n) => n.message).join(' / '),
      destination: destination.name,
    });
  };
  record(0, [], plan, null);
  let vehicle = startVehicle(plan.routes.find((r) => r.routeId === plan.recommendedRouteId)?.edgeIds ?? []);
  let sim = SimResponseSchema.parse((await t.http().get(`/scenarios/${SID}/sim`)).body).sim;
  expect(sim.state).toBe('idle');
  const events = scenario.events;

  for (let tS = stepS; tS <= untilS && !vehicle.arrived; tS += stepS) {
    vehicle = advanceVehicle(
      graph,
      vehicle,
      stepS,
      incidents,
      alertContext(scenario.alerts, scenario.hasAlertInformation, tS),
      scenario.demoTrip.vehicleSpeedFactor,
    );
    const applied: string[] = [];
    while (sim.nextEventIndex < sim.eventCount && events[sim.nextEventIndex]!.atS <= tS) {
      const ev = events[sim.nextEventIndex]!;
      const res = await t.http().post(`/scenarios/${SID}/sim/step`).set(AUTH).send({});
      expect(res.status).toBe(200);
      sim = SimResponseSchema.parse(res.body).sim;
      expect(sim.simTimeS).toBe(ev.atS);
      applied.push(ev.id);
    }
    if (applied.length === 0) continue;
    incidents = (await snapshot()).incidents;
    if (vehicle.arrived) continue;
    const pos = vehiclePosition(graph, vehicle)!;
    const replan = () =>
      replanFrom({
        graph,
        destination: destination.nodeId,
        currentRoute: vehicle.edgeIds.slice(vehicle.index),
        vehicle: { edgeId: pos.edgeId, fraction: vehicle.fraction },
        ...conditions(tS),
        places: scenario.places,
        destinationPlaceId: destination.id,
      });
    plan = replan();
    if (plan.recommendedRouteId) vehicle = followPlan(graph, vehicle, plan);
    else if (plan.reachable) {
      destination = placeById.get(plan.reachable.placeId)!;
      plan = replan();
      if (plan.recommendedRouteId) vehicle = followPlan(graph, vehicle, plan);
    }
    record(tS, applied, plan, vehicle);
  }
  expect(sim.nextEventIndex).toBe(sim.eventCount);
  expect(sim.state).toBe('finished');
  const final = await snapshot();
  const upserts = socket.received
    .filter(([e]) => e === 'incident.upserted')
    .map(([, p]) => (p as { seq: number }).seq);
  socket.disconnect();
  return { log, incidents: final.incidents, resetSeq, runId: sim.runId, upserts };
}

describe('scripted scenario through the API', () => {
  let first: RunResult;
  let second: RunResult;

  beforeAll(async () => {
    first = await runScenario();
    second = await runScenario();
  }, 120_000);

  it('produces the demo recommendations in order', () => {
    const byEvent = (id: string) => first.log.find((l) => l.eventIds.includes(id))!;
    // Initial plan plus one replan per 5 s window with events (ev04 and ev05 fall in separate ones).
    expect(first.log.map((l) => l.eventIds.join('+'))).toEqual(['', ...scenario.events.map((e) => e.id)]);
    expect(first.log[0]!.recommended).toBe('Via Andheri Subway');
    expect(byEvent('ev01-ankle').recommended).toBe('Via Andheri Subway');
    expect(byEvent('ev01-ankle').change).toContain('Route unchanged: one unverified report');
    expect(byEvent('ev02-knee').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev02-knee').vehicleRoadName).toBe('Andheri-Kurla Road');
    expect(byEvent('ev03-verify').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev04-congestion-a').recommended).toBe('Via Gokhale Bridge');
    expect(byEvent('ev05-congestion-b').recommended).toBe('Via Jogeshwari Road Over Bridge');
    expect(byEvent('ev05-congestion-b').vehicleRoadName).toBe('Western Express Highway');
    const closure = byEvent('ev07-verify-closure');
    expect(closure.destination).toBe('HBT Trauma Care Hospital');
  });

  it('matches the offline replay (same incidents and identical engine plan hashes)', () => {
    const offline = replayScenario(scenario, andheriGraph);
    const offlineEvents = offline.log.filter((l) => l.kind !== 'end');
    expect(first.log.map((l) => [l.atS, l.recommended, l.vehicleRoadName, l.hash])).toEqual(
      offlineEvents.map((l) => [l.atS, l.recommended, l.vehicleRoadName, l.hash]),
    );
    // Incidents equal the replay's, with seq counted from the reset.
    const normalised = first.incidents.map((i) => ({ ...i, seq: i.seq - first.resetSeq }));
    expect(normalised).toEqual([...offline.incidents].sort((a, b) => (a.id < b.id ? -1 : 1)));
  });

  it('incident states and ids are the deterministic scripted ones', () => {
    const byId = new Map(first.incidents.map((i) => [i.id, i]));
    const flood = byId.get(`${SID}:inc:ev01-ankle`)!;
    expect(flood).toMatchObject({
      status: 'verified',
      verifiedBy: 'simulated_operator',
      source: 'simulated',
      depth: 'knee',
      deviceCount: 2,
      verifiedAtS: 270,
    });
    expect(byId.get(`${SID}:inc:ev04-congestion-a`)).toMatchObject({ status: 'corroborated', congestion: 'heavy' });
    expect(byId.get(`${SID}:inc:ev06-closure`)).toMatchObject({ status: 'verified', impassable: true });
    expect(first.upserts).toEqual(scenario.events.map((_, i) => first.resetSeq + i + 1));
  });

  it('reset then replay gives identical incident snapshots and plan hashes', () => {
    expect(second.runId).not.toBe(first.runId);
    expect(second.resetSeq).toBeGreaterThan(first.resetSeq);
    const strip = (r: RunResult) => r.incidents.map((i) => ({ ...i, seq: i.seq - r.resetSeq }));
    expect(strip(second)).toEqual(strip(first));
    expect(second.log).toEqual(first.log);
    expect(second.log.map((l) => l.hash)).toEqual(first.log.map((l) => l.hash));
  });
});

describe('sim clock', () => {
  it('play applies due events from the clock, keeps ticking after the last one, pause gives finished', async () => {
    const fast = await startApp({ SIM_TICK_MS: '50' });
    try {
      await resetScenario(fast);
      const s = await connect(fast);
      await join(s);
      await fast.http().post(`/scenarios/${SID}/sim/play`).set(AUTH).send({});
      const lastAtS = scenario.events[scenario.events.length - 1]!.atS;
      let sim = SimResponseSchema.parse((await fast.http().get(`/scenarios/${SID}/sim`)).body).sim;
      const deadline = Date.now() + 20_000;
      while (sim.simTimeS < lastAtS + 100 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
        sim = SimResponseSchema.parse((await fast.http().get(`/scenarios/${SID}/sim`)).body).sim;
      }
      expect(sim.state).toBe('playing');
      expect(sim.nextEventIndex).toBe(sim.eventCount);
      expect(sim.simTimeS).toBeGreaterThan(lastAtS);
      const paused = SimResponseSchema.parse(
        (await fast.http().post(`/scenarios/${SID}/sim/pause`).set(AUTH).send({})).body,
      ).sim;
      expect(paused.state).toBe('finished');
      const snap = IncidentsResponseSchema.parse((await fast.http().get(`/scenarios/${SID}/incidents`)).body);
      // Same ids and statuses as the stepped run: events carry their own atS as server time.
      expect(snap.incidents.map((i) => [i.id, i.status, i.updatedAtS])).toEqual([
        [`${SID}:inc:ev01-ankle`, 'verified', 270],
        [`${SID}:inc:ev04-congestion-a`, 'corroborated', 370],
        [`${SID}:inc:ev06-closure`, 'verified', 490],
      ]);
      const ticks = s.received.filter(([e]) => e === 'sim.tick').map(([, p]) => (p as { simTimeS: number }).simTimeS);
      expect(ticks.length).toBeGreaterThan(5);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
      // A real report during the run gets the current simulation time.
      const r = await fast
        .http()
        .post(`/scenarios/${SID}/reports`)
        .send({ type: 'debris', severity: 'low', point: { lat: 19.116357, lng: 72.846569 }, observedPersonally: true, deviceId: 'device-real' });
      expect(r.status).toBe(201);
      expect(r.body.receipt.receivedAtS).toBe(paused.simTimeS);
    } finally {
      await fast.close();
    }
  });
});

describe('decision history for replay', () => {
  it('rebuilds the incident set at every seq, matching the live snapshots', async () => {
    const { startApp, AUTH, SID } = await import('./helpers');
    const { HistoryResponseSchema, IncidentsResponseSchema, incidentsAtSeq } = await import('@vighnaway/contracts');
    const t = await startApp();
    try {
      await t.http().post(`/scenarios/${SID}/sim/reset`).set(AUTH).send({});
      const seen: { seq: number; ids: string }[] = [];
      for (let i = 0; i < 7; i++) {
        await t.http().post(`/scenarios/${SID}/sim/step`).set(AUTH).send({});
        const snap = IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);
        seen.push({ seq: snap.seq, ids: JSON.stringify(snap.incidents) });
      }
      const h = HistoryResponseSchema.parse((await t.http().get(`/scenarios/${SID}/history`)).body);
      expect(h.entries.length).toBeGreaterThan(0);
      for (const s of seen) expect(JSON.stringify(incidentsAtSeq(h.entries, s.seq))).toBe(s.ids);
    } finally {
      await t.close();
    }
  });
});
