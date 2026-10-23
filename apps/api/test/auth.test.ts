import { createHmac } from 'node:crypto';
import {
  AdminUserResponseSchema,
  AdminUsersResponseSchema,
  AuthSessionResponseSchema,
  MeResponseSchema,
  MyReportsResponseSchema,
  MyStatsResponseSchema,
  OtpRequestResponseSchema,
  ReportResponseSchema,
  UpdateMeResponseSchema,
  type Client,
} from '@vighnaway/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../src/db/client';
import { AUTH, report, resetScenario, SID, startApp, type TestApp } from './helpers';
import { TEST_DATABASE_URL } from './env';

/**
 * Email one-time-code accounts against a real database. The code is recovered from its stored HMAC
 * (the test knows AUTH_SECRET), so the test needs no mail server and the API never returns a code.
 */

const SECRET = 'integration-test-auth-secret-0123456789';
const ADMIN = 'boss@example.com';
let t: TestApp;
let h: DbHandle;

beforeAll(async () => {
  t = await startApp({ AUTH_SECRET: SECRET, ADMIN_EMAILS: ADMIN, OTP_RESEND_S: '0', OTP_MAX_PER_EMAIL_PER_HOUR: '1000', OTP_MAX_PER_IP_PER_HOUR: '1000' });
  h = createDb(TEST_DATABASE_URL, { max: 2 });
});
afterAll(async () => {
  await h?.close();
  await t?.close();
});
beforeEach(async () => {
  await h.sql`DELETE FROM auth_sessions`;
  await h.sql`DELETE FROM auth_otps`;
  await h.sql`DELETE FROM users`;
  await resetScenario(t);
});

async function recoverCode(email: string): Promise<string> {
  const [row] = await h.sql<{ code_hash: string }[]>`SELECT code_hash FROM auth_otps WHERE email = ${email} ORDER BY created_at DESC LIMIT 1`;
  for (let n = 0; n < 1_000_000; n++) {
    const code = String(n).padStart(6, '0');
    if (createHmac('sha256', SECRET).update(`otp:${email}:${code}`).digest('hex') === row!.code_hash) return code;
  }
  throw new Error('code not found');
}

const request = (email: string, client: Client = 'web') => t.http().post('/auth/otp/request').send({ email, client });

async function signIn(email: string, client: Client = 'web') {
  expect((await request(email, client)).status).toBe(200);
  const res = await t.http().post('/auth/otp/verify').send({ email, client, code: await recoverCode(email) });
  return { res, bearer: { Authorization: `Bearer ${res.body.token}` } };
}

describe('sign in', () => {
  it('request then verify creates a citizen and a working session', async () => {
    const r = await request('asha@example.com', 'mobile');
    expect(OtpRequestResponseSchema.parse(r.body).sent).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/\d{6}/);
    const { res, bearer } = await signIn('asha@example.com', 'mobile');
    expect(res.status).toBe(200);
    const s = AuthSessionResponseSchema.parse(res.body);
    expect(s.user.role).toBe('citizen');
    const me = await t.http().get('/auth/me').set(bearer);
    expect(MeResponseSchema.parse(me.body).client).toBe('mobile');
    expect((await t.http().post('/auth/logout').set(bearer)).status).toBe(204);
    expect((await t.http().get('/auth/me').set(bearer)).status).toBe(401);
  });

  it('a wrong code is 401 and a malformed body is 400', async () => {
    await request('asha@example.com');
    const bad = await t.http().post('/auth/otp/verify').send({ email: 'asha@example.com', client: 'web', code: '000000' });
    expect([200, 401]).toContain(bad.status); // 1 in a million the code really is 000000
    expect((await t.http().post('/auth/otp/verify').send({ email: 'asha@example.com', client: 'web', code: '12' })).status).toBe(400);
    expect((await t.http().post('/auth/otp/request').send({ email: 'nope', client: 'web' })).status).toBe(400);
  });

  it('staff accounts are refused on the phone with 403', async () => {
    const { res } = await signIn(ADMIN, 'web');
    expect(res.body.user.role).toBe('admin');
    await request(ADMIN, 'mobile');
    const phone = await t.http().post('/auth/otp/verify').send({ email: ADMIN, client: 'mobile', code: await recoverCode(ADMIN) });
    expect(phone.status).toBe(403);
    expect(phone.body.error.code).toBe('FORBIDDEN');
  });
});

describe('operator actions', () => {
  it('accept the shared token and operator/admin sessions; refuse citizens and anonymous', async () => {
    expect((await t.http().get('/operator/check').set(AUTH)).status).toBe(204);
    const admin = await signIn(ADMIN);
    expect((await t.http().get('/operator/check').set(admin.bearer)).status).toBe(204);
    await t.http().post('/admin/users').set(admin.bearer).send({ email: 'op@example.com', role: 'operator' });
    const op = await signIn('op@example.com');
    expect((await t.http().get('/operator/check').set(op.bearer)).status).toBe(204);
    const citizen = await signIn('asha@example.com');
    expect((await t.http().get('/operator/check').set(citizen.bearer)).status).toBe(403);
    expect((await t.http().get('/operator/check')).status).toBe(401);
  });

  it('an operator session can run simulation controls', async () => {
    const admin = await signIn(ADMIN);
    const res = await t.http().post(`/scenarios/${SID}/sim/reset`).set(admin.bearer).send({});
    expect(res.status).toBe(200);
  });
});

describe('admin users', () => {
  it('lists, creates, changes and disables; only admins may call it', async () => {
    const admin = await signIn(ADMIN);
    const created = await t.http().post('/admin/users').set(admin.bearer).send({ email: 'op@example.com', role: 'operator' });
    expect(created.status).toBe(201);
    const id = AdminUserResponseSchema.parse(created.body).user.id;
    expect((await t.http().post('/admin/users').set(admin.bearer).send({ email: 'op@example.com', role: 'admin' })).status).toBe(409);

    const list = AdminUsersResponseSchema.parse((await t.http().get('/admin/users').set(admin.bearer)).body);
    expect(list.users.map((u) => u.email).sort()).toEqual([ADMIN, 'op@example.com']);

    const op = await signIn('op@example.com');
    expect((await t.http().get('/admin/users').set(op.bearer)).status).toBe(403);
    expect((await t.http().get('/admin/users')).status).toBe(401);

    const changed = await t.http().post(`/admin/users/${id}`).set(admin.bearer).send({ disabled: true });
    expect(AdminUserResponseSchema.parse(changed.body).user.disabled).toBe(true);
    expect((await t.http().get('/operator/check').set(op.bearer)).status).toBe(401);

    const self = AdminUsersResponseSchema.parse((await t.http().get('/admin/users').set(admin.bearer)).body).users.find((u) => u.email === ADMIN)!;
    expect((await t.http().post(`/admin/users/${self.id}`).set(admin.bearer).send({ role: 'citizen' })).status).toBe(409);
  });
});

describe('reports and thanks', () => {
  it('a signed-in report is linked to the account and counted; anonymous and stale-token reports still work', async () => {
    const citizen = await signIn('asha@example.com', 'mobile');
    const post = (body: object, headers: Record<string, string> = {}) => t.http().post(`/scenarios/${SID}/reports`).set(headers).send(body);

    const mine = await post(report({ deviceId: 'device-asha-1' }), citizen.bearer);
    expect(mine.status).toBe(201);
    ReportResponseSchema.parse(mine.body);
    expect((await post(report({ deviceId: 'device-anon-1' }))).status).toBe(201);
    expect((await post(report({ deviceId: 'device-stale-1' }), { Authorization: 'Bearer vws_stale' })).status).toBe(201);

    const stats = MyStatsResponseSchema.parse((await t.http().get('/me/stats').set(citizen.bearer)).body);
    expect(stats.reports).toBe(1);
    expect(stats.inVerifiedIncidents).toBe(0);
    expect((await t.http().get('/me/stats')).status).toBe(401);
  });
});

describe('own account', () => {
  it('renames, lists its reports with their status, and removes itself while the reports stay', async () => {
    const citizen = await signIn('erase@example.com', 'mobile');
    const me = t.http();
    const renamed = UpdateMeResponseSchema.parse((await me.patch('/me').set(citizen.bearer).send({ displayName: '  Erin  ' })).body);
    expect(renamed.user.displayName).toBe('Erin');
    expect((await me.patch('/me').set(citizen.bearer).send({ displayName: '' })).status).toBe(400);
    expect((await me.patch('/me').send({ displayName: 'X' })).status).toBe(401);

    expect((await t.http().post(`/scenarios/${SID}/reports`).set(citizen.bearer).send(report({ deviceId: 'device-erase-1' }))).status).toBe(201);
    const mine = MyReportsResponseSchema.parse((await t.http().get('/me/reports').set(citizen.bearer)).body);
    expect(mine.reports).toHaveLength(1);
    expect((await t.http().get('/me/reports')).status).toBe(401);

    expect((await t.http().delete('/me').set(citizen.bearer)).status).toBe(204);
    expect((await t.http().get('/auth/me').set(citizen.bearer)).status).toBe(401);
    // The report is still there for routing; it just points at nobody.
    const rows = await h.sql`SELECT user_id FROM incident_reports WHERE id = ${mine.reports[0]!.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBeNull();

    const admin = await signIn(ADMIN, 'web');
    expect((await t.http().delete('/me').set(admin.bearer)).status).toBe(403);
  });
});
