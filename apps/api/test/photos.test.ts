import { PhotoListResponseSchema, ReportPhotoResponseSchema, ReportResponseSchema } from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, report, resetScenario, SID, startApp, SUBWAY, type TestApp } from './helpers';

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

const jpeg = (n = 3000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1), Buffer.from([0xff, 0xd9])]);
const DEVICE = 'device-photo-aaaa';

async function sendReport(deviceId = DEVICE): Promise<string> {
  const res = await t.http().post(`/scenarios/${SID}/reports`).send(report({ deviceId, point: SUBWAY }));
  expect(res.status).toBe(201);
  return ReportResponseSchema.parse(res.body).receipt.reportId;
}
const upload = (reportId: string, body: object) => t.http().post(`/scenarios/${SID}/reports/${encodeURIComponent(reportId)}/photo`).send(body);
const photoBody = (deviceId = DEVICE, bytes = jpeg()) => ({ deviceId, contentType: 'image/jpeg', data: bytes.toString('base64') });

describe('report photos', () => {
  it('attaches a JPEG to the report it belongs to, for the device that sent the report', async () => {
    const reportId = await sendReport();
    const res = await upload(reportId, photoBody());
    expect(res.status).toBe(201);
    expect(ReportPhotoResponseSchema.parse(res.body)).toMatchObject({ reportId, sizeBytes: jpeg().length });
  });

  it('refuses a photo from another device, a second photo, a non-JPEG and an unknown report', async () => {
    const reportId = await sendReport();
    expect((await upload(reportId, photoBody('device-other-bbbb'))).status).toBe(403);
    expect((await upload(reportId, photoBody())).status).toBe(201);
    expect((await upload(reportId, photoBody())).status).toBe(409);
    const other = await sendReport('device-photo-cccc');
    const text = { deviceId: 'device-photo-cccc', contentType: 'image/jpeg', data: Buffer.from('<script>alert(1)</script>'.repeat(10)).toString('base64') };
    expect((await upload(other, text)).status).toBe(400);
    expect((await upload(`${SID}:rep:nope`, photoBody())).status).toBe(404);
  });

  it('takes a body larger than the 16 kB default on this route only', async () => {
    const reportId = await sendReport();
    expect((await upload(reportId, photoBody(DEVICE, jpeg(120_000)))).status).toBe(201);
    const big = await t.http().post(`/scenarios/${SID}/reports`).send({ ...report({ deviceId: 'device-big-dddd' }), description: 'x'.repeat(40_000) });
    expect(big.status).toBe(413);
  });

  it('shows photos to operators only, never publicly, and never caches them', async () => {
    const reportId = await sendReport();
    await upload(reportId, photoBody());
    const url = `/scenarios/${SID}/reports/${encodeURIComponent(reportId)}/photo`;
    expect((await t.http().get(url)).status).toBe(401);
    expect((await t.http().get(`/scenarios/${SID}/photos`)).status).toBe(401);
    const img = await t.http().get(url).set(AUTH).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toBe('private, no-store');
    expect((img.body as Buffer).equals(jpeg())).toBe(true);
    const list = await t.http().get(`/scenarios/${SID}/photos`).set(AUTH);
    expect(list.status).toBe(200);
    const parsed = PhotoListResponseSchema.parse(list.body);
    expect(parsed.photos).toHaveLength(1);
    expect(parsed.photos[0]).toMatchObject({ reportId, atS: 0 });
  });
});
