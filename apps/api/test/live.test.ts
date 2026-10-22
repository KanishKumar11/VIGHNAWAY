import {
  IncidentUpsertedSchema,
  SimResetSchema,
  SimStateSchema,
  SimTickSchema,
  type TripPosition,
  TripPositionSchema,
} from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, connect, join, report, resetScenario, SID, sleep, startApp, type TestApp, waitForEvent } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  await resetScenario(t);
});

const trip = (simTimeS: number): TripPosition => ({
  scenarioId: SID,
  routeId: '10005632789-623038359-0',
  coordinate: { lat: 19.11556, lng: 72.85039 },
  headingDeg: 270,
  simTimeS,
  edgeId: '10005632789-623038359-0',
  edgeFraction: 0.25,
  profile: 'car',
  destinationId: 'hosp-holy-spirit',
  edgeIds: ['10005632789-623038359-0'],
  travelledEdgeCount: 0,
  status: 'en_route',
});

describe('/live gateway', () => {
  it('join acks { ok, seq, runId }; unknown scenarios are refused', async () => {
    const s = await connect(t);
    const sim = (await t.http().get(`/scenarios/${SID}/sim`)).body.sim;
    const ack = await join(s);
    expect(ack).toEqual({ ok: true, seq: sim.seq, runId: sim.runId });
    const bad = await s.timeout(5000).emitWithAck('join', { scenarioId: 'nope' });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('NOT_FOUND');
  });

  it('incident.upserted reaches the room after commit with seq and a plain-language summary', async () => {
    const s = await connect(t);
    const other = await connect(t); // not joined: receives nothing
    await join(s);
    await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-aaaa' }));
    const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-bbbb', depth: 'knee' }));
    const ev = IncidentUpsertedSchema.parse(
      await waitForEvent(s, 'incident.upserted', (p: { incident: { status: string } }) => p.incident.status === 'corroborated'),
    );
    expect(ev.seq).toBe(res.body.incident.seq);
    expect(ev.incident).toEqual(res.body.incident);
    expect(ev.summary).toBe('Flooding (knee deep) at Andheri Subway marked Corroborated (2 devices) · User report');
    // The snapshot already contains it when the event arrives.
    const snap = (await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=${ev.seq - 1}`)).body;
    expect(snap.incidents.map((i: { id: string }) => i.id)).toEqual([ev.incident.id]);
    const ups = s.received.filter(([e]) => e === 'incident.upserted').map(([, p]) => (p as { seq: number }).seq);
    expect(ups).toEqual([ev.seq - 1, ev.seq]);
    expect(other.received.filter(([e]) => e === 'incident.upserted')).toEqual([]);
  });

  it('sim.state on play and pause, sim.tick once per real second while playing, sim.reset on reset', async () => {
    const s = await connect(t);
    await join(s);
    const play = await t.http().post(`/scenarios/${SID}/sim/play`).set(AUTH).send({});
    expect(play.status).toBe(200);
    expect(play.body.sim.state).toBe('playing');
    const st = SimStateSchema.parse(await waitForEvent(s, 'sim.state', (p: { state: string }) => p.state === 'playing'));
    expect(st.simSecondsPerRealSecond).toBe(10);
    const tick = SimTickSchema.parse(await waitForEvent(s, 'sim.tick', () => true, 2500));
    expect(tick.runId).toBe(st.runId);
    expect(tick.simTimeS).toBeGreaterThanOrEqual(10);
    expect(tick.simTimeS % 10).toBe(0);
    const pause = await t.http().post(`/scenarios/${SID}/sim/pause`).set(AUTH).send({});
    expect(pause.body.sim.state).toBe('paused');
    await waitForEvent(s, 'sim.state', (p: { state: string }) => p.state === 'paused');
    const ticks = s.received.filter(([e]) => e === 'sim.tick').length;
    await sleep(1300);
    expect(s.received.filter(([e]) => e === 'sim.tick').length).toBe(ticks);

    const reset = await t.http().post(`/scenarios/${SID}/sim/reset`).set(AUTH).send({});
    const ev = SimResetSchema.parse(await waitForEvent(s, 'sim.reset'));
    expect(ev.runId).toBe(reset.body.sim.runId);
    expect(ev.runId).not.toBe(st.runId);
    expect(ev.seq).toBe(reset.body.sim.seq);
    await waitForEvent(s, 'sim.state', (p: { state: string; runId: string }) => p.state === 'idle' && p.runId === ev.runId);
  });

  it('sim actions need the operator token', async () => {
    for (const a of ['play', 'pause', 'step', 'reset']) {
      const res = await t.http().post(`/scenarios/${SID}/sim/${a}`).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('trip.position is relayed to the room, kept (latest only) for late joiners, rate-limited per socket', async () => {
    const phone = await connect(t);
    const consoleA = await connect(t);
    await join(phone);
    await join(consoleA);
    const ack1 = await phone.timeout(5000).emitWithAck('trip.position', trip(10));
    expect(ack1).toEqual({ ok: true });
    const got = TripPositionSchema.parse(await waitForEvent(consoleA, 'trip.position'));
    expect(got.simTimeS).toBe(10);
    // Too soon: dropped.
    const ack2 = await phone.timeout(5000).emitWithAck('trip.position', trip(20));
    expect(ack2.ok).toBe(false);
    expect(ack2.error.code).toBe('RATE_LIMITED');
    await sleep(950);
    expect(await phone.timeout(5000).emitWithAck('trip.position', trip(30))).toEqual({ ok: true });
    await waitForEvent(consoleA, 'trip.position', (p: TripPosition) => p.simTimeS === 30);
    expect(phone.received.filter(([e]) => e === 'trip.position')).toEqual([]);
    expect(consoleA.received.filter(([e]) => e === 'trip.position').map(([, p]) => (p as TripPosition).simTimeS)).toEqual([10, 30]);

    const late = await connect(t);
    await join(late);
    const latest = await waitForEvent(late, 'trip.position');
    expect((latest as TripPosition).simTimeS).toBe(30);

    // Invalid payloads and sockets that have not joined are refused; incidents are untouched.
    await sleep(950);
    const invalid = await phone.timeout(5000).emitWithAck('trip.position', { ...trip(40), headingDeg: 999 });
    expect(invalid.error.code).toBe('VALIDATION_FAILED');
    const stranger = await connect(t);
    const refused = await stranger.timeout(5000).emitWithAck('trip.position', trip(50));
    expect(refused.ok).toBe(false);
    const snap = (await t.http().get(`/scenarios/${SID}/incidents`)).body;
    expect(snap.incidents).toEqual([]);

    // Reset forgets the vehicle.
    await resetScenario(t);
    const afterReset = await connect(t);
    await join(afterReset);
    await sleep(200);
    expect(afterReset.received.filter(([e]) => e === 'trip.position')).toEqual([]);
  });

  it('refuses socket connections from browser origins not on the allowlist', async () => {
    await expect(connect(t, { origin: 'http://evil.example' })).rejects.toBeTruthy();
    const ok = await connect(t, { origin: 'http://localhost:3000' });
    expect(ok.connected).toBe(true);
  });
});
