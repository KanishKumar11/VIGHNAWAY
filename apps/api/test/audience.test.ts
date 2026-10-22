import { ClearAudienceResponseSchema, IncidentsResponseSchema, ReportResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReportsService } from '../src/reports/reports.service';
import { AUTH, HOSPITAL_ROAD, NAGARDAS, report, resetScenario, SID, startApp, SUBWAY, type TestApp } from './helpers';

/**
 * P1-3.a audience origin and bulk clear, P1-4.b answer semantics, F-COV.a observations.
 * Written to run against a database seeded with the fixture graph used by the other API tests.
 */

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
const incidents = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);
const clear = (headers: Record<string, string> = AUTH) => t.http().post(`/scenarios/${SID}/audience/clear`).set(headers).send({});

describe('report origin: audience', () => {
  it('stores the origin and flags an incident that only audience reports support', async () => {
    const res = await post(report({ deviceId: 'device-aud1', origin: 'audience' }));
    expect(res.status).toBe(201);
    expect(ReportResponseSchema.parse(res.body).incident!.audienceOnly).toBe(true);
    const app = ReportResponseSchema.parse((await post(report({ deviceId: 'device-app1', point: NAGARDAS, type: 'closure', depth: undefined }))).body);
    expect(app.incident!.audienceOnly).toBeUndefined();
  });

  it('a non-audience report on the same incident makes it a normal incident', async () => {
    await post(report({ deviceId: 'device-aud1', origin: 'audience' }));
    const res = await post(report({ deviceId: 'device-app1' }));
    const { incident } = ReportResponseSchema.parse(res.body);
    expect(incident!.audienceOnly).toBeUndefined();
    expect(incident!.deviceCount).toBe(2);
    // Two audience phones still corroborate, and stay audience-only.
    await resetScenario(t);
    await post(report({ deviceId: 'device-aud1', origin: 'audience' }));
    const second = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aud2', origin: 'audience' }))).body);
    expect(second.incident!.status).toBe('corroborated');
    expect(second.incident!.audienceOnly).toBe(true);
  });

  it('rejects an unknown origin', async () => {
    const res = await post(report({ deviceId: 'device-aud1', origin: 'friends' as never }));
    expect(res.status).toBe(400);
  });
});

describe('POST /scenarios/:id/audience/clear', () => {
  it('needs the operator token', async () => {
    expect((await clear({})).status).toBe(401);
    expect((await clear({ Authorization: 'Bearer wrong' })).status).toBe(401);
  });

  it('dismisses audience-only incidents and leaves the others, advancing the seq once per incident', async () => {
    await post(report({ deviceId: 'device-aud1', origin: 'audience' }));
    await post(report({ deviceId: 'device-app1', point: NAGARDAS, type: 'closure', depth: undefined }));
    const before = await incidents();
    const audience = before.incidents.find((i) => i.audienceOnly)!;
    const other = before.incidents.find((i) => !i.audienceOnly)!;
    const res = await clear();
    expect(res.status).toBe(200);
    const body = ClearAudienceResponseSchema.parse(res.body);
    expect(body).toEqual({ cleared: 1, incidentIds: [audience.id] });
    const after = await incidents();
    expect(after.seq).toBe(before.seq + 1);
    expect(after.incidents.find((i) => i.id === audience.id)!.status).toBe('dismissed');
    expect(after.incidents.find((i) => i.id === other.id)!.status).toBe('unverified');
    // The change is in the history with the operator as actor.
    const history = (await t.http().get(`/scenarios/${SID}/history`)).body as { entries: { kind: string; incident: { id: string } }[] };
    expect(history.entries.some((e) => e.kind === 'dismissed' && e.incident.id === audience.id)).toBe(true);
    // Nothing left to clear.
    expect(ClearAudienceResponseSchema.parse((await clear()).body).cleared).toBe(0);
  });

  it('also clears an audience incident an operator verified, but never a mixed one', async () => {
    const a = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aud1', origin: 'audience' }))).body).incident!;
    await t.http().post(`/scenarios/${SID}/incidents/${encodeURIComponent(a.id)}/verify`).set(AUTH).send({});
    await post(report({ deviceId: 'device-app1', point: HOSPITAL_ROAD, type: 'closure', depth: undefined, origin: 'audience' }));
    await post(report({ deviceId: 'device-app2', point: HOSPITAL_ROAD, type: 'closure', depth: undefined }));
    const body = ClearAudienceResponseSchema.parse((await clear()).body);
    expect(body.incidentIds).toEqual([a.id]);
  });
});

describe('report origin: prompt (answers to a data-gap question)', () => {
  it('a second answer for the same road from the same device within 30 simulated minutes is a 409', async () => {
    const reports = t.app.get(ReportsService);
    const first = await post(report({ deviceId: 'device-ans1', origin: 'prompt', type: 'road_clear', depth: undefined }));
    expect(first.status).toBe(201);
    const repeat = await post(report({ deviceId: 'device-ans1', origin: 'prompt', type: 'flood', depth: undefined }));
    expect(repeat.status).toBe(409);
    expect((await post(report({ deviceId: 'device-ans2', origin: 'prompt', type: 'road_clear', depth: undefined }))).status).toBe(201);
    // 30 simulated minutes later the same device may answer again.
    const later = await reports.submit(SID, report({ deviceId: 'device-ans1', origin: 'prompt', type: 'road_clear', depth: undefined }), { source: 'user_report', nowS: 1801 });
    expect(later.receipt.receivedAtS).toBe(1801);
  });

  it('a No answer marks an open incident Conflicting but two of them never resolve it', async () => {
    const created = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa', depth: 'knee' }))).body).incident!;
    await post(report({ deviceId: 'device-ans1', origin: 'prompt', type: 'road_clear', depth: undefined }));
    await post(report({ deviceId: 'device-ans2', origin: 'prompt', type: 'road_clear', depth: undefined }));
    const now = (await incidents()).incidents.find((i) => i.id === created.id)!;
    expect(now.conflicting).toBe(true);
    expect(now.status).toBe('unverified');
    // An ordinary Road clear from two devices still resolves it (unchanged behaviour).
    await post(report({ deviceId: 'device-clr1', type: 'road_clear', depth: undefined }));
    const resolved = ReportResponseSchema.parse((await post(report({ deviceId: 'device-clr2', type: 'road_clear', depth: undefined }))).body);
    expect(resolved.receipt.outcome).toBe('resolved_by_clear_reports');
  });

  it('a Yes answer is an ordinary Unverified flood incident, never auto-Verified', async () => {
    const { incident } = ReportResponseSchema.parse((await post(report({ deviceId: 'device-ans1', origin: 'prompt', depth: undefined, observedPersonally: false }))).body);
    expect(incident!.status).toBe('unverified');
    expect(incident!.verifiedBy).toBeNull();
    expect(incident!.depth).toBeNull();
  });
});

describe('observations in GET /incidents (F-COV.a)', () => {
  it('lists the latest report time per flood-prone edge, and a Road clear shows as clear without creating an incident', async () => {
    const empty = await incidents();
    expect(empty.observations ?? []).toEqual([]);
    await post(report({ deviceId: 'device-clr1', type: 'road_clear', depth: undefined }));
    const afterClear = await incidents();
    expect(afterClear.incidents).toHaveLength(0);
    expect(afterClear.seq).toBe(baseSeq);
    expect(afterClear.observations!.length).toBeGreaterThan(0);
    expect(afterClear.observations!.every((o) => o.kind === 'clear' && o.lastObservedAtS === 0)).toBe(true);
    // Both directions of the road are listed.
    expect(new Set(afterClear.observations!.map((o) => o.edgeId)).size).toBe(afterClear.observations!.length);
    await post(report({ deviceId: 'device-aaaa' }));
    const afterHazard = await incidents();
    expect(afterHazard.observations!.some((o) => o.kind === 'hazard')).toBe(true);
    // A later hazard report replaces the clear observation on the same edge.
    expect(afterHazard.observations!.filter((o) => o.edgeId === afterClear.observations![0]!.edgeId)).toHaveLength(1);
  });
});

void SUBWAY;
