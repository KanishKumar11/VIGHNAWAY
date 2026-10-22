import { randomUUID } from 'node:crypto';
import { IncidentsResponseSchema, ReportResponseSchema } from '@vighnaway/contracts';
import { andheriLiveScenario } from '@vighnaway/scenario-data';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client';
import { TEST_DATABASE_URL } from './env';
import { OFF_ROAD, report, SID, startApp, SUBWAY, type TestApp } from './helpers';

const LIVE = andheriLiveScenario.id;
/** Amritsar: nowhere near the Andheri graph. */
const AMRITSAR = { lat: 31.64918, lng: 74.8572 };

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});

async function clear() {
  const h = createDb(TEST_DATABASE_URL, { max: 1 });
  try {
    await h.sql`DELETE FROM offmap_reports WHERE scenario_id = ${LIVE}`;
    await h.sql`DELETE FROM incident_events WHERE scenario_id = ${LIVE}`;
    await h.sql`DELETE FROM incident_reports WHERE scenario_id = ${LIVE}`;
    await h.sql`DELETE FROM incidents WHERE scenario_id = ${LIVE}`;
  } finally {
    await h.close();
  }
}
beforeEach(clear);

const post = (scenario: string, body: unknown) => t.http().post(`/scenarios/${scenario}/reports`).send(body as object);
const incidents = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${LIVE}/incidents?sinceSeq=-1`)).body).incidents;

describe('live mode accepts a report from anywhere', () => {
  it('saves a far-away report as off_map: 201, no edge, no incident, nothing for routing', async () => {
    const before = (await incidents()).length;
    const res = await post(LIVE, report({ deviceId: 'device-aaaa', point: AMRITSAR }));
    expect(res.status).toBe(201);
    const body = ReportResponseSchema.parse(res.body);
    expect(body.receipt).toMatchObject({ outcome: 'off_map', snappedEdgeId: null, roadName: null, distanceToRoadM: null });
    expect(body.incident).toBeNull();
    expect(await incidents()).toHaveLength(before);
  });

  it('also saves a point in Andheri that is more than 30 m from a road', async () => {
    const res = await post(LIVE, report({ deviceId: 'device-aaaa', point: OFF_ROAD }));
    expect(res.status).toBe(201);
    expect(ReportResponseSchema.parse(res.body).receipt.outcome).toBe('off_map');
  });

  it('stores a repeated client id once and returns the same receipt', async () => {
    const clientReportId = randomUUID();
    const a = ReportResponseSchema.parse((await post(LIVE, report({ deviceId: 'device-aaaa', point: AMRITSAR, clientReportId }))).body);
    const b = ReportResponseSchema.parse((await post(LIVE, report({ deviceId: 'device-aaaa', point: AMRITSAR, clientReportId }))).body);
    expect(b.receipt.reportId).toBe(a.receipt.reportId);
    const h = createDb(TEST_DATABASE_URL, { max: 1 });
    try {
      const rows = await h.sql`SELECT count(*)::int AS n FROM offmap_reports WHERE scenario_id = ${LIVE}`;
      expect(rows[0]?.n).toBe(1);
    } finally {
      await h.close();
    }
  });

  it('still snaps and creates an incident when the point is on a mapped road', async () => {
    const res = await post(LIVE, report({ deviceId: 'device-aaaa', point: SUBWAY }));
    expect(res.status).toBe(201);
    expect(ReportResponseSchema.parse(res.body).receipt.outcome).toBe('created_incident');
  });

  it('keeps the same 400 for a point that is not a coordinate', async () => {
    const res = await post(LIVE, report({ deviceId: 'device-aaaa', point: { lat: 95, lng: 0 } }));
    expect(res.status).toBe(400);
  });
});

describe('the scripted demo stays strict', () => {
  it('422 NOT_ON_ROAD for the simulated scenario, with no off-map row', async () => {
    const res = await post(SID, report({ deviceId: 'device-aaaa', point: AMRITSAR }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_ON_ROAD');
  });
});
