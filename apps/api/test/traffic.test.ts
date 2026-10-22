import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Incident, IncidentsResponseSchema } from '@vighnaway/contracts';
import { alertContext, loadGraph, planTrip } from '@vighnaway/engine';
import { andheriGraph, andheriLiveScenario } from '@vighnaway/scenario-data';
import { createDb } from '../src/db/client';
import { mapTomTomIncident, matchEdges, TomTomIncidentSchema } from '../src/traffic/tomtom';
import { AUTH, connect, startApp, type TestApp } from './helpers';
import { TEST_DATABASE_URL } from './env';

const LIVE = andheriLiveScenario.id;
const recorded = JSON.parse(readFileSync(join(__dirname, 'fixtures/tomtom-incident-details.json'), 'utf8')) as {
  incidents: Array<{ properties: { id: string } }>;
};
const without = (...ids: string[]) => ({ incidents: recorded.incidents.filter((i) => !ids.includes(i.properties?.id)) });

/** Local stand-in for api.tomtom.com that records requests and serves the configured body. */
function mockTomTom() {
  const state = { body: recorded as unknown, status: 200, requests: [] as URL[] };
  const server = http.createServer((req, res) => {
    state.requests.push(new URL(req.url ?? '/', 'http://x'));
    res.writeHead(state.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state.status === 200 ? state.body : { detailedError: { code: 'Forbidden' } }));
  });
  return { state, server };
}

async function clearLive() {
  const h = createDb(TEST_DATABASE_URL, { max: 1 });
  try {
    await h.sql`DELETE FROM incident_events WHERE scenario_id = ${LIVE}`;
    await h.sql`DELETE FROM incident_reports WHERE scenario_id = ${LIVE}`;
    await h.sql`DELETE FROM incidents WHERE scenario_id = ${LIVE}`;
  } finally {
    await h.close();
  }
}

describe('TomTom mapping (pure)', () => {
  const parsed = recorded.incidents.map((i) => TomTomIncidentSchema.safeParse(i));
  it('parses the recorded response and rejects the malformed incident', () => {
    expect(parsed.filter((p) => p.success)).toHaveLength(6);
  });
  it('maps categories, magnitudes and probabilities to VIGHNAWAY incidents', () => {
    const mapped = parsed.filter((p) => p.success).map((p) => mapTomTomIncident(p.data!));
    const [jam, closed, acc, fog, risk] = mapped;
    expect(jam).toMatchObject({ type: 'congestion', congestion: 'standstill', status: 'corroborated', directional: true });
    expect(jam!.feed).toMatchObject({ provider: 'tomtom', externalId: 'TT-JAM-1', delayS: 540, magnitude: 3, probability: 'certain' });
    expect(closed).toMatchObject({ type: 'closure', impassable: true, status: 'corroborated', directional: false });
    expect(acc).toMatchObject({ type: 'accident', severity: 'medium', status: 'unverified', impassable: false });
    expect(fog).toBeNull();
    expect(risk).toBeNull();
  });
  it('matches directional hazards to one carriageway and closures to both', () => {
    const edges = andheriGraph.edges.map((e) => ({ id: e.id, reverseId: e.reverseId, name: e.name, coordinates: e.geometry as [number, number][] }));
    const jam = mapTomTomIncident(parsed[0]!.data!)!;
    const jamEdges = matchEdges(jam, edges, 25);
    expect(jamEdges.length).toBeGreaterThan(0);
    for (const id of jamEdges) {
      const e = andheriGraph.edges.find((x) => x.id === id)!;
      expect(e.name).toBe('G K Gokhale Flyover');
      expect(jamEdges).not.toContain(e.reverseId); // one direction only
    }
    const closedEdges = matchEdges(mapTomTomIncident(parsed[1]!.data!)!, edges, 25);
    const subway = andheriGraph.edges.filter((e) => e.name === 'Andheri Subway').map((e) => e.id).sort();
    expect(closedEdges).toEqual(subway);
  });
});

describe('TomTom live traffic feed (API)', () => {
  let t: TestApp;
  const tomtom = mockTomTom();

  beforeAll(async () => {
    await new Promise<void>((r) => tomtom.server.listen(0, '127.0.0.1', () => r()));
    const port = (tomtom.server.address() as AddressInfo).port;
    t = await startApp({ TOMTOM_API_KEY: 'test-tomtom-key', TOMTOM_BASE_URL: `http://127.0.0.1:${port}`, TRAFFIC_POLL_SECONDS: '0' });
  });
  afterAll(async () => {
    await t.close();
    await new Promise((r) => tomtom.server.close(r));
    await clearLive();
  });
  beforeEach(async () => {
    tomtom.state.body = recorded;
    tomtom.state.status = 200;
    tomtom.state.requests = [];
    await clearLive();
  });

  const poll = () => t.http().post(`/scenarios/${LIVE}/feed/poll`).set(AUTH).send();
  const liveIncidents = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${LIVE}/incidents`)).body).incidents;

  it('live scenario runs on the wall clock and refuses simulation controls', async () => {
    const sim = (await t.http().get(`/scenarios/${LIVE}/sim`)).body.sim;
    const expected = Math.floor((Date.now() - Date.parse(andheriLiveScenario.clockStartsAt)) / 1000);
    expect(sim.state).toBe('playing');
    expect(Math.abs(sim.simTimeS - expected)).toBeLessThan(5);
    expect((await t.http().post(`/scenarios/${LIVE}/sim/play`).set(AUTH).send({})).status).toBe(409);
    const list = (await t.http().get('/scenarios')).body.scenarios;
    expect(list.find((s: { id: string }) => s.id === LIVE)).toMatchObject({ mode: 'live', simulated: false });
  });

  it('polls TomTom with the key, bbox and fields, and creates labelled incidents', async () => {
    const ws = await connect(t);
    await new Promise<void>((r) => ws.emit('join', { scenarioId: LIVE }, () => r()));
    const res = await poll();
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ fetched: 6, invalid: 1, skipped: 2, unmatched: 1, created: 3, updated: 0, cleared: 0 });
    const req = tomtom.state.requests[0]!;
    expect(req.pathname).toBe('/traffic/services/5/incidentDetails');
    expect(req.searchParams.get('key')).toBe('test-tomtom-key');
    expect(req.searchParams.get('bbox')!.split(',')).toHaveLength(4);
    expect(req.searchParams.get('fields')).toContain('probabilityOfOccurrence');

    const incs = await liveIncidents();
    expect(incs).toHaveLength(3);
    for (const i of incs) {
      expect(i.source).toBe('live_feed');
      expect(i.feed?.provider).toBe('tomtom');
    }
    const jam = incs.find((i) => i.feed?.externalId === 'TT-JAM-1')!;
    expect(jam).toMatchObject({ type: 'congestion', congestion: 'standstill', status: 'corroborated', roadName: 'G K Gokhale Flyover' });
    expect(incs.find((i) => i.feed?.externalId === 'TT-CLOSED-2')).toMatchObject({ type: 'closure', status: 'corroborated' });
    expect(incs.find((i) => i.feed?.externalId === 'TT-ACC-3')).toMatchObject({ type: 'accident', status: 'unverified' });

    await new Promise((r) => setTimeout(r, 200));
    const summaries = ws.received.filter(([e]) => e === 'incident.upserted').map(([, p]) => (p as { summary: string }).summary);
    expect(summaries).toHaveLength(3);
    expect(summaries.join(' ')).toMatch(/reported by live traffic/);
    expect(summaries.join(' ')).toMatch(/TomTom live traffic/);
    expect(summaries.join(' ')).not.toMatch(/confirmed|\bsafe\b/i);

    const status = (await t.http().get(`/scenarios/${LIVE}/feed`)).body;
    expect(status).toMatchObject({ enabled: true, reason: null, lastError: null, activeIncidents: 3, attribution: 'Traffic data © TomTom' });
  });

  it('an unchanged poll publishes nothing; a missing incident is cleared; a returning one is linked', async () => {
    await poll();
    const seqBefore = (await t.http().get(`/scenarios/${LIVE}/incidents`)).body.seq;
    expect((await poll()).body.result).toMatchObject({ created: 0, updated: 0, cleared: 0 });
    expect((await t.http().get(`/scenarios/${LIVE}/incidents`)).body.seq).toBe(seqBefore);

    tomtom.state.body = without('TT-JAM-1');
    expect((await poll()).body.result).toMatchObject({ created: 0, updated: 0, cleared: 1 });
    const cleared = (await liveIncidents()).find((i) => i.feed?.externalId === 'TT-JAM-1')!;
    expect(cleared.status).toBe('resolved');

    tomtom.state.body = recorded;
    expect((await poll()).body.result).toMatchObject({ created: 1 });
    const again = (await liveIncidents()).filter((i) => i.feed?.externalId === 'TT-JAM-1' && i.status !== 'resolved');
    expect(again).toHaveLength(1);
    expect(again[0]!.linkedIncidentId).toBe(cleared.id);
  });

  it('a TomTom error is reported and clears nothing; operator dismissals stick', async () => {
    await poll();
    tomtom.state.status = 403;
    const res = await poll();
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/403.*TOMTOM_API_KEY/);
    expect((await t.http().get(`/scenarios/${LIVE}/feed`)).body.lastError).toMatch(/403/);
    expect((await liveIncidents()).every((i) => i.status !== 'resolved')).toBe(true);

    tomtom.state.status = 200;
    const closure = (await liveIncidents()).find((i) => i.type === 'closure')!;
    expect((await t.http().post(`/scenarios/${LIVE}/incidents/${encodeURIComponent(closure.id)}/dismiss`).set(AUTH).send({})).status).toBe(200);
    expect((await poll()).body.result).toMatchObject({ created: 0 });
    expect((await liveIncidents()).filter((i) => i.type === 'closure').map((i) => i.status)).toEqual(['dismissed']);
  });

  it('the engine routes around a TomTom closure and labels the evidence', async () => {
    await poll();
    const incs: Incident[] = await liveIncidents();
    const car = loadGraph(andheriGraph, 'car');
    const place = (id: string) => andheriLiveScenario.places.find((p) => p.id === id)!;
    const nowS = (await t.http().get(`/scenarios/${LIVE}/sim`)).body.sim.simTimeS;
    const plan = planTrip({
      graph: car,
      origin: place('live-origin-marol').nodeId,
      destination: place('live-hosp-kokilaben').nodeId,
      incidents: incs,
      nowS,
      alerts: andheriLiveScenario.alerts,
      hasAlertInformation: andheriLiveScenario.hasAlertInformation,
    });
    const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId)!;
    // The recommended route never uses an edge the closure covers.
    const closed = incs.find((i) => i.type === 'closure' && i.source === 'live_feed')!;
    expect(rec.edgeIds.some((id) => closed.edgeIds.includes(id))).toBe(false);
    expect(rec.explanation.reason).toMatch(/Reported by TomTom live traffic/);
    expect(alertContext([], false, nowS).rainAlertActive).toBe(false);
  });

  it('never runs for the simulated scenario', async () => {
    expect((await t.http().post('/scenarios/andheri-monsoon/feed/poll').set(AUTH).send()).status).toBe(409);
    expect((await t.http().get('/scenarios/andheri-monsoon/feed')).body).toMatchObject({ enabled: false });
  });
});

describe('feed off without a key', () => {
  it('reports why and refuses to poll', async () => {
    const t = await startApp({ TOMTOM_API_KEY: '', TRAFFIC_POLL_SECONDS: '0' });
    try {
      expect((await t.http().get(`/scenarios/${LIVE}/feed`)).body).toMatchObject({ enabled: false, reason: 'TOMTOM_API_KEY not set' });
      expect((await t.http().post(`/scenarios/${LIVE}/feed/poll`).set(AUTH).send()).status).toBe(409);
    } finally {
      await t.close();
    }
  });
});
