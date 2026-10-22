import { ApiErrorSchema, HealthResponseSchema, ScenarioListResponseSchema, ScenarioResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { andheriGraph } from '@vighnaway/scenario-data';
import { report, resetScenario, SID, startApp, type TestApp } from './helpers';
import { TEST_ORIGIN } from './env';

describe('health, scenarios and hygiene', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
    await resetScenario(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('GET /health reports db, PostGIS and the seeded graph version', async () => {
    const res = await t.http().get('/health');
    expect(res.status).toBe(200);
    const h = HealthResponseSchema.parse(res.body);
    expect(h).toMatchObject({ ok: true, db: true, graphVersion: andheriGraph.graphVersion });
    expect(h.postgis).toMatch(/^3\./);
  });

  it('GET /scenarios and /scenarios/:id return the seeded scenario and its sim state', async () => {
    const list = ScenarioListResponseSchema.parse((await t.http().get('/scenarios')).body);
    expect(list.scenarios.map((s) => [s.id, s.mode, s.simulated])).toEqual([
      ['andheri-live', 'live', false],
      [SID, 'simulated', true],
    ]);
    const one = ScenarioResponseSchema.parse((await t.http().get(`/scenarios/${SID}`)).body);
    expect(one.scenario.events.length).toBe(7);
    expect(one.sim.state).toBe('idle');
    expect((await t.http().get('/scenarios/unknown')).body.error.code).toBe('NOT_FOUND');
  });

  it('unknown routes, oversized and malformed bodies use the error envelope', async () => {
    const r404 = await t.http().get('/nope');
    expect(r404.status).toBe(404);
    expect(ApiErrorSchema.parse(r404.body).error.code).toBe('NOT_FOUND');

    const big = await t
      .http()
      .post(`/scenarios/${SID}/reports`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...report({ deviceId: 'device-aaaa' }), description: 'x'.repeat(17_000) }));
    expect(big.status).toBe(413);
    expect(ApiErrorSchema.parse(big.body).error.code).toBe('PAYLOAD_TOO_LARGE');

    const bad = await t.http().post(`/scenarios/${SID}/reports`).set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(ApiErrorSchema.parse(bad.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('sets helmet headers and allows only listed CORS origins', async () => {
    const ok = await t.http().get('/scenarios').set('Origin', TEST_ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['x-powered-by']).toBeUndefined();
    const evil = await t.http().get('/scenarios').set('Origin', 'http://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await t
      .http()
      .options(`/scenarios/${SID}/reports`)
      .set('Origin', TEST_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });
});

describe('throttling', () => {
  it('429 RATE_LIMITED after 5 reports per minute from one device', async () => {
    const t = await startApp({ REPORT_DEVICE_LIMIT_PER_MIN: '5', REPORT_IP_LIMIT_PER_MIN: '100' });
    try {
      await resetScenario(t);
      for (let i = 0; i < 5; i++) {
        const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-flood' }));
        expect(res.status).toBe(201);
      }
      const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-flood' }));
      expect(res.status).toBe(429);
      expect(ApiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
      // Another device from the same IP is still accepted.
      const other = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-other' }));
      expect(other.status).toBe(201);
    } finally {
      await t.close();
    }
  });

  it('429 RATE_LIMITED after 10 requests per minute from one IP', async () => {
    const t = await startApp({ REPORT_DEVICE_LIMIT_PER_MIN: '100', REPORT_IP_LIMIT_PER_MIN: '10' });
    try {
      await resetScenario(t);
      for (let i = 0; i < 10; i++) {
        const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: `device-ip-${i}` }));
        expect(res.status).toBe(201);
      }
      const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId: 'device-ip-x' }));
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    } finally {
      await t.close();
    }
  });
});
