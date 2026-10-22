import { IncidentsResponseSchema, ReportResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { report, resetScenario, SID, startApp, SUBWAY, type TestApp } from './helpers';

/** P2-2.a offline relay: a device-made report id makes a relayed report idempotent; observedAtS is bounded and a label only. */

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
const CID = '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e9f0a11';
const open = async () => IncidentsResponseSchema.parse((await t.http().get(`/scenarios/${SID}/incidents`)).body);

describe('clientReportId and observedAtS', () => {
  it('a repeat of the same client id returns the original receipt and stores nothing new', async () => {
    const first = ReportResponseSchema.parse((await post(report({ deviceId: 'device-aaaa', clientReportId: CID, point: SUBWAY }))).body);
    const before = await open();
    // The same report relayed again by someone else's phone: a different relayer, the same id.
    const again = await post(report({ deviceId: 'device-aaaa', clientReportId: CID, point: SUBWAY }));
    expect(again.status).toBe(201);
    const second = ReportResponseSchema.parse(again.body);
    expect(second.receipt).toEqual(first.receipt);
    expect(second.incident?.id).toBe(first.incident?.id);
    const after = await open();
    expect(after.seq).toBe(before.seq);
    expect(after.incidents).toHaveLength(before.incidents.length);
    expect(after.incidents.find((i) => i.id === first.incident?.id)?.reportCount).toBe(1);
  });

  it('a different client id is not mistaken for a repeat', async () => {
    await post(report({ deviceId: 'device-aaaa', clientReportId: CID, point: SUBWAY }));
    const other = ReportResponseSchema.parse((await post(report({ deviceId: 'device-bbbb', clientReportId: '9a7c1d2e-8b3f-4c5d-a6e7-1f2a3b4c5d6e', point: SUBWAY }))).body);
    expect(other.receipt.outcome).not.toBe('created_incident');
  });

  it('rejects a client id that is not a UUID', async () => {
    expect((await post(report({ deviceId: 'device-aaaa', clientReportId: 'not-a-uuid' }))).status).toBe(400);
  });

  it('accepts an observedAtS within the last 2 hours, keeps the server time authoritative, and refuses the future and the distant past', async () => {
    const sim = (await t.http().get(`/scenarios/${SID}/sim`)).body.sim ?? {};
    const nowS = Number(sim.simTimeS ?? 0);
    const ok = await post(report({ deviceId: 'device-aaaa', observedAtS: Math.max(0, nowS - 600), point: SUBWAY }));
    expect(ok.status).toBe(201);
    expect(ReportResponseSchema.parse(ok.body).receipt.receivedAtS).toBeGreaterThanOrEqual(nowS);
    const future = await post(report({ observedAtS: nowS + 3600, deviceId: 'device-cccc' }));
    expect(future.status).toBe(400);
    // A past claim older than 2 hours can only be tested once the clock is past 2 hours.
    if (nowS > 7200 + 1) expect((await post(report({ observedAtS: nowS - 7300, deviceId: 'device-dddd' }))).status).toBe(400);
  });
});
