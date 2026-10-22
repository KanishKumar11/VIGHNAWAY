import { ClosureResponseSchema, IncidentsResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, resetScenario, SID, startApp, type TestApp } from './helpers';

/**
 * P2-6.a operator-drawn closures. Needs the database seeded with the real graph (osm-7efdf89a8094):
 * the line follows the Andheri Subway road under the railway.
 */

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

const SUBWAY_LINE = [
  { lat: 19.12423, lng: 72.84912 },
  { lat: 19.12371, lng: 72.8513 },
];
const post = (body: unknown, headers: Record<string, string> = AUTH) => t.http().post(`/scenarios/${SID}/closures`).set(headers).send(body as object);
const open = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);

describe('POST /scenarios/:id/closures', () => {
  it('needs the operator credential', async () => {
    expect((await post({ polyline: SUBWAY_LINE }, {})).status).toBe(401);
  });

  it('previews the matched roads without creating anything', async () => {
    const before = await open();
    const res = await post({ polyline: SUBWAY_LINE });
    expect(res.status).toBe(200);
    const body = ClosureResponseSchema.parse(res.body);
    expect(body.incident).toBeNull();
    expect(body.preview.roadNames).toContain('Andheri Subway');
    expect(body.preview.edgeIds.length).toBeGreaterThan(0);
    expect(body.preview.edgeIds).toEqual([...body.preview.edgeIds].sort());
    const after = await open();
    expect(after.incidents).toEqual(before.incidents);
    expect(after.seq).toBe(before.seq);
  });

  it('matching is deterministic', async () => {
    const a = (await post({ polyline: SUBWAY_LINE })).body;
    const b = (await post({ polyline: SUBWAY_LINE })).body;
    expect(b).toEqual(a);
  });

  it('confirm creates one Verified closure from the operator, advances the seq, and appears in history', async () => {
    const before = await open();
    const res = await post({ polyline: SUBWAY_LINE, confirm: true, note: '<b>Barricades</b>' });
    expect(res.status).toBe(200);
    const body = ClosureResponseSchema.parse(res.body);
    const inc = body.incident!;
    expect(inc).toMatchObject({ type: 'closure', status: 'verified', source: 'operator', verifiedBy: 'operator', impassable: true, roadName: 'Andheri Subway' });
    expect(inc.edgeIds).toEqual(body.preview.edgeIds);
    expect(inc.note).toBe('<b>Barricades</b>');
    expect(inc.seq).toBe(before.seq + 1);
    expect((await open()).incidents.map((i) => i.id)).toContain(inc.id);
    const history = (await t.http().get(`/scenarios/${SID}/history`)).body;
    expect(history.entries.some((e: { incident: { id: string } }) => e.incident.id === inc.id)).toBe(true);
  });

  it('the same roads cannot be closed twice while a closure is open (409)', async () => {
    expect((await post({ polyline: SUBWAY_LINE, confirm: true })).status).toBe(200);
    expect((await post({ polyline: SUBWAY_LINE, confirm: true })).status).toBe(409);
  });

  it('refuses a line that is not on a road (422) and a body that is not valid (400)', async () => {
    const sea = await post({ polyline: [{ lat: 19.1, lng: 72.8181 }, { lat: 19.1001, lng: 72.8182 }] });
    expect(sea.status).toBe(422);
    expect(sea.body.error.code).toBe('NOT_ON_ROAD');
    expect((await post({ polyline: [SUBWAY_LINE[0]] })).status).toBe(400);
    expect((await post({ polyline: SUBWAY_LINE, status: 'verified' })).status).toBe(400);
  });
});
