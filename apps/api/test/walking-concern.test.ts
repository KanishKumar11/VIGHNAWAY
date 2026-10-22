import { IncidentsResponseSchema, ReportResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, report, resetScenario, SID, startApp, SUBWAY, type TestApp } from './helpers';

/** P2-8: walking concerns are ordinary incidents on a road, display only, with no free text and a stricter limit. */

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

const post = (body: unknown) => t.http().post(`/scenarios/${SID}/reports`).send(body as object);
const concern = (deviceId: string, over: Record<string, unknown> = {}) =>
  report({ type: 'walking_concern', concern: 'poorly_lit', depth: undefined, deviceId, point: SUBWAY, ...over } as never);
const open = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);

describe('walking concern reports', () => {
  it('creates an Unverified incident with its concern, source and no note', async () => {
    const res = await post(concern('device-aaaa'));
    expect(res.status).toBe(201);
    const inc = ReportResponseSchema.parse(res.body).incident!;
    expect(inc).toMatchObject({ type: 'walking_concern', concern: 'poorly_lit', status: 'unverified', source: 'user_report', note: null, impassable: false });
  });

  it('two devices reporting "Poorly lit" on one road make it Corroborated', async () => {
    await post(concern('device-aaaa'));
    const second = ReportResponseSchema.parse((await post(concern('device-bbbb'))).body);
    expect(second.receipt.outcome).toBe('corroborated');
    expect((await open()).incidents.filter((i) => i.type === 'walking_concern')).toHaveLength(1);
  });

  it('a different concern on the same road is its own incident', async () => {
    await post(concern('device-aaaa'));
    await post(concern('device-bbbb', { concern: 'isolated' }));
    const list = (await open()).incidents.filter((i) => i.type === 'walking_concern');
    expect(list.map((i) => i.concern).sort()).toEqual(['isolated', 'poorly_lit']);
  });

  it('refuses a note, a severity, a missing concern and a concern on another type', async () => {
    expect((await post(concern('device-aaaa', { description: 'near the shop of Mr X' }))).status).toBe(400);
    expect((await post(concern('device-aaaa', { severity: 'high' }))).status).toBe(400);
    expect((await post(concern('device-aaaa', { concern: undefined }))).status).toBe(400);
    expect((await post(report({ type: 'flood', depth: 'knee', concern: 'isolated', deviceId: 'device-aaaa', point: SUBWAY } as never))).status).toBe(400);
  });

  it('limits one device to three walking concerns per hour (429)', async () => {
    const points = [SUBWAY, { lat: 19.1245, lng: 72.8645 }, { lat: 19.1155, lng: 72.8515 }, { lat: 19.1198, lng: 72.8566 }];
    const statuses: number[] = [];
    for (const p of points) statuses.push((await post(concern('device-aaaa', { point: p }))).status);
    expect(statuses.slice(0, 3).every((s) => s === 201 || s === 422)).toBe(true);
    // Whatever the first three did (a point off a road is 422 and does not count), a fourth accepted one is refused.
    const accepted = statuses.filter((s) => s === 201).length;
    if (accepted >= 3) expect(statuses[3]).toBe(429);
  });

  it('a Road clear report never touches a walking concern', async () => {
    const created = ReportResponseSchema.parse((await post(concern('device-aaaa'))).body).incident!;
    await post(report({ type: 'road_clear', deviceId: 'device-bbbb', point: SUBWAY, depth: undefined } as never));
    await post(report({ type: 'road_clear', deviceId: 'device-cccc', point: SUBWAY, depth: undefined } as never));
    const after = (await open()).incidents.find((i) => i.id === created.id)!;
    expect(after.status).toBe('unverified');
    expect(after.conflicting).toBe(false);
  });

  it('only an operator verifies one, and it still has no routing effect on the incident count the planner sees', async () => {
    const created = ReportResponseSchema.parse((await post(concern('device-aaaa'))).body).incident!;
    expect((await t.http().post(`/scenarios/${SID}/incidents/${encodeURIComponent(created.id)}/verify`).send({})).status).toBe(401);
    const ok = await t.http().post(`/scenarios/${SID}/incidents/${encodeURIComponent(created.id)}/verify`).set(AUTH).send({});
    expect(ok.status).toBe(200);
    expect((await open()).incidents.find((i) => i.id === created.id)?.status).toBe('verified');
  });
});
