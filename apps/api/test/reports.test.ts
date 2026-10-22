import {
  ApiErrorSchema,
  IncidentsResponseSchema,
  OperatorActionResponseSchema,
  ReportResponseSchema,
} from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReportsService } from '../src/reports/reports.service';
import { AUTH, HOSPITAL_ROAD, NAGARDAS, report, resetScenario, SID, startApp, SUBWAY, type TestApp } from './helpers';

let t: TestApp;
let baseSeq = 0;

beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t?.close();
});
beforeEach(async () => {
  baseSeq = await resetScenario(t);
});

const post = (body: unknown) => t.http().post(`/scenarios/${SID}/reports`).send(body as object);
const act = (incidentId: string, action: string, headers: Record<string, string> = AUTH) =>
  t
    .http()
    .post(`/scenarios/${SID}/incidents/${encodeURIComponent(incidentId)}/${action}`)
    .set(headers)
    .send({});

describe('POST /scenarios/:id/reports', () => {
  it('creates an Unverified user_report incident, snapped to the road, with server time', async () => {
    const res = await post(report({ deviceId: 'device-aaaa', description: '  <b>water</b> rising  ' }));
    expect(res.status).toBe(201);
    const body = ReportResponseSchema.parse(res.body);
    expect(body.receipt.outcome).toBe('created_incident');
    expect(body.receipt.roadName).toBe('Andheri Subway');
    expect(body.receipt.snappedEdgeId).toBe('fx029-fx030-0');
    expect(body.receipt.receivedAtS).toBe(0);
    const inc = body.incident!;
    expect(inc.status).toBe('unverified');
    expect(inc.source).toBe('user_report');
    expect(inc.depth).toBe('ankle');
    expect(inc.edgeIds).toEqual(['fx029-fx030-0', 'fx030-fx029-0']);
    expect(inc.reportCount).toBe(1);
    expect(inc.deviceCount).toBe(1);
    expect(inc.seq).toBe(baseSeq + 1);
    // Plain text, stored and returned as given (trimmed), never interpreted.
    expect(inc.note).toBe('<b>water</b> rising');
  });

  it('a second device corroborates; merges the deepest depth and latest note', async () => {
    await post(report({ deviceId: 'device-aaaa', description: 'ankle deep' }));
    const res = await post(report({ deviceId: 'device-bbbb', depth: 'knee', description: 'knee deep' }));
    expect(res.status).toBe(201);
    const { receipt, incident } = ReportResponseSchema.parse(res.body);
    expect(receipt.outcome).toBe('corroborated');
    expect(incident!.status).toBe('corroborated');
    expect(incident!.deviceCount).toBe(2);
    expect(incident!.reportCount).toBe(2);
    expect(incident!.depth).toBe('knee');
    expect(incident!.note).toBe('knee deep');
  });

  it('the same device does not corroborate: its earlier report is updated (duplicate)', async () => {
    const first = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body);
    const res = await post(report({ deviceId: 'device-aaaa', depth: 'knee' }));
    const { receipt, incident } = ReportResponseSchema.parse(res.body);
    expect(receipt.outcome).toBe('updated_duplicate');
    expect(receipt.reportId).toBe(first.receipt.reportId);
    expect(incident!.id).toBe(first.incident!.id);
    expect(incident!.status).toBe('unverified');
    expect(incident!.reportCount).toBe(1);
    expect(incident!.deviceCount).toBe(1);
    expect(incident!.depth).toBe('knee');
  });

  it('corroboration needs both devices within 30 simulated minutes', async () => {
    const reports = t.app.get(ReportsService);
    const a = await reports.submit(SID, report({ deviceId: 'device-aaaa' }), { source: 'user_report', nowS: 0 });
    const b = await reports.submit(SID, report({ deviceId: 'device-bbbb' }), { source: 'user_report', nowS: 1801 });
    expect(b.incident!.id).toBe(a.incident!.id);
    expect(b.receipt.outcome).toBe('attached');
    expect(b.incident!.status).toBe('unverified');
    const c = await reports.submit(SID, report({ deviceId: 'device-cccc' }), { source: 'user_report', nowS: 1900 });
    expect(c.receipt.outcome).toBe('corroborated');
  });

  it('a different type nearby creates its own incident; congestion extent covers 600 m of the road', async () => {
    await post(report({ deviceId: 'device-aaaa' }));
    const res = await post({ type: 'congestion', congestion: 'heavy', point: NAGARDAS, observedPersonally: true, deviceId: 'device-cccc' });
    const { incident } = ReportResponseSchema.parse(res.body);
    expect(incident!.type).toBe('congestion');
    expect(incident!.edgeIds).toEqual([
      'fx006-fx025-0',
      'fx024-fx025-0',
      'fx024-fx044-0',
      'fx025-fx006-0',
      'fx025-fx024-0',
      'fx044-fx024-0',
    ]);
  });

  it('422 NOT_ON_ROAD when the point is more than 30 m from any road', async () => {
    const res = await post(report({ deviceId: 'device-aaaa', point: { lat: 19.12, lng: 72.87 } }));
    expect(res.status).toBe(422);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('NOT_ON_ROAD');
    expect(res.body.error.message).toBe('Not on a known road');
  });

  it('400 VALIDATION_FAILED with issues for bad bodies, unknown keys and client timestamps', async () => {
    for (const body of [
      {},
      { ...report({ deviceId: 'device-aaaa' }), receivedAtS: 5 },
      { type: 'congestion', point: SUBWAY, observedPersonally: true, deviceId: 'device-aaaa' },
      report({ deviceId: 'short' }),
      report({ deviceId: 'device-aaaa', description: 'x'.repeat(201) }),
      { ...report({ deviceId: 'device-aaaa' }), type: 'closure', depth: 'knee' },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      const err = ApiErrorSchema.parse(res.body).error;
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(err.details)).toBe(true);
    }
  });

  it('404 for an unknown scenario', async () => {
    const res = await t.http().post('/scenarios/nope/reports').send(report({ deviceId: 'device-aaaa' }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('Road clear marks an open incident Conflicting; clear reports from two devices resolve it', async () => {
    const created = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body);
    const clear1 = ReportResponseSchema.parse(
      (await post({ type: 'road_clear', point: SUBWAY, observedPersonally: true, deviceId: 'device-cccc' })).body,
    );
    expect(clear1.receipt.outcome).toBe('marked_conflicting');
    expect(clear1.incident!.id).toBe(created.incident!.id);
    expect(clear1.incident!.conflicting).toBe(true);
    expect(clear1.incident!.status).toBe('unverified');
    // Same device again: still only one clearing device.
    const again = ReportResponseSchema.parse(
      (await post({ type: 'road_clear', point: SUBWAY, observedPersonally: true, deviceId: 'device-cccc' })).body,
    );
    expect(again.receipt.outcome).toBe('marked_conflicting');
    expect(again.receipt.reportId).toBe(clear1.receipt.reportId);
    const clear2 = ReportResponseSchema.parse(
      (await post({ type: 'road_clear', point: SUBWAY, observedPersonally: true, deviceId: 'device-dddd' })).body,
    );
    expect(clear2.receipt.outcome).toBe('resolved_by_clear_reports');
    expect(clear2.incident!.status).toBe('resolved');
    expect(clear2.incident!.closedAtS).toBe(0);
  });

  it('Road clear with nothing nearby is noted with no incident', async () => {
    const res = await post({ type: 'road_clear', point: HOSPITAL_ROAD, observedPersonally: true, deviceId: 'device-cccc' });
    expect(res.status).toBe(201);
    const body = ReportResponseSchema.parse(res.body);
    expect(body.receipt.outcome).toBe('clear_noted');
    expect(body.incident).toBeNull();
  });

  it('a late report after Resolved creates a new Unverified incident linked to the old one', async () => {
    const first = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body);
    expect((await act(first.incident!.id, 'resolve')).status).toBe(200);
    const late = ReportResponseSchema.parse((await post(report({ deviceId: 'device-bbbb' }))).body);
    expect(late.receipt.outcome).toBe('linked_new_incident');
    expect(late.incident!.id).not.toBe(first.incident!.id);
    expect(late.incident!.status).toBe('unverified');
    expect(late.incident!.linkedIncidentId).toBe(first.incident!.id);
    const snap = IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);
    expect(snap.incidents.find((i) => i.id === first.incident!.id)!.status).toBe('resolved');
  });
});

describe('operator actions', () => {
  it('verify requires the Bearer token (401 otherwise) and sets Verified by operator', async () => {
    const { incident } = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body);
    for (const headers of [{}, { Authorization: 'Bearer wrong-token' }, { Authorization: 'Basic abc' }] as Record<string, string>[]) {
      const res = await act(incident!.id, 'verify', headers);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
    const res = await act(incident!.id, 'verify');
    expect(res.status).toBe(200);
    const after = OperatorActionResponseSchema.parse(res.body).incident;
    expect(after.status).toBe('verified');
    expect(after.verifiedBy).toBe('operator');
    expect(after.verifiedAtS).toBe(0);
    expect(after.seq).toBe(incident!.seq + 1);
  });

  it('resolve and dismiss close the incident; actions on closed incidents are 409', async () => {
    const a = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body).incident!;
    const b = ReportResponseSchema.parse(
      (await post({ type: 'closure', point: HOSPITAL_ROAD, observedPersonally: true, deviceId: 'device-eeee' })).body,
    ).incident!;
    expect(b.impassable).toBe(true);
    const ra = OperatorActionResponseSchema.parse((await act(a.id, 'resolve')).body).incident;
    expect(ra.status).toBe('resolved');
    expect(ra.closedAtS).toBe(0);
    const rb = OperatorActionResponseSchema.parse((await act(b.id, 'dismiss')).body).incident;
    expect(rb.status).toBe('dismissed');
    for (const [id, action] of [
      [a.id, 'verify'],
      [a.id, 'resolve'],
      [b.id, 'dismiss'],
    ] as const) {
      const res = await act(id, action);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    }
  });

  it('404 for unknown incidents and actions; 400 for unknown body keys', async () => {
    expect((await act(`${SID}:inc:missing`, 'verify')).status).toBe(404);
    const { incident } = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body);
    expect((await act(incident!.id, 'explode')).status).toBe(404);
    const bad = await t
      .http()
      .post(`/scenarios/${SID}/incidents/${encodeURIComponent(incident!.id)}/verify`)
      .set(AUTH)
      .send({ note: 'ok', status: 'verified' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /operator/check is 204 with the token and 401 without', async () => {
    expect((await t.http().get('/operator/check').set(AUTH)).status).toBe(204);
    const res = await t.http().get('/operator/check');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /scenarios/:id/incidents (resync)', () => {
  it('sinceSeq returns only newer changes; full after a reset or with no sinceSeq', async () => {
    const a = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa' }))).body).incident!;
    const b = ReportResponseSchema.parse(
      (await post({ type: 'closure', point: HOSPITAL_ROAD, observedPersonally: true, deviceId: 'device-eeee' })).body,
    ).incident!;
    const all = IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);
    expect(all.full).toBe(true);
    expect(all.seq).toBe(baseSeq + 2);
    expect(all.incidents.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());

    const since = IncidentsResponseSchema.parse(
      (await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=${a.seq}`)).body,
    );
    expect(since.full).toBe(false);
    expect(since.incidents.map((i) => i.id)).toEqual([b.id]);

    const none = IncidentsResponseSchema.parse(
      (await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=${all.seq}`)).body,
    );
    expect(none.full).toBe(false);
    expect(none.incidents).toEqual([]);

    const oldRun = all.runId;
    const resetSeq = await resetScenario(t);
    const after = IncidentsResponseSchema.parse(
      (await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=${all.seq}`)).body,
    );
    expect(after.full).toBe(true);
    expect(after.incidents).toEqual([]);
    expect(after.seq).toBe(resetSeq);
    expect(after.runId).not.toBe(oldRun);
    const atReset = IncidentsResponseSchema.parse(
      (await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=${resetSeq}`)).body,
    );
    expect(atReset.full).toBe(false);
  });

  it('400 for a malformed sinceSeq', async () => {
    const res = await t.http().get(`/scenarios/${SID}/incidents?sinceSeq=-1`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
