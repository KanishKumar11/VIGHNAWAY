import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { optionalAuth } from '../../src/auth/auth.guard';
import { hashOtp } from '../../src/auth/auth.crypto';
import { AuthService } from '../../src/auth/auth.service';
import { ApiException } from '../../src/common/errors';
import { OperatorGuard } from '../../src/common/operator.guard';
import { type AppConfig, loadConfig } from '../../src/config';
import { CaptureMailer, MemoryAuthRepo } from './memory-repo';

const ADMIN = 'boss@example.com';
const OP_TOKEN = 'unit-test-operator-token-0123456789';

let now = new Date('2026-07-14T09:00:00Z');
const advance = (s: number) => (now = new Date(now.getTime() + s * 1000));

function setup(env: Record<string, string> = {}) {
  now = new Date('2026-07-14T09:00:00Z');
  const config: AppConfig = loadConfig({ ADMIN_EMAILS: ADMIN, OPERATOR_TOKEN: OP_TOKEN, AUTH_SECRET: 'unit-test-secret-0123456789', ...env });
  const repo = new MemoryAuthRepo();
  const mailer = new CaptureMailer();
  const auth = new AuthService(config, repo, mailer, () => now);
  return { config, repo, mailer, auth };
}

async function signIn(s: ReturnType<typeof setup>, email: string, client: 'web' | 'mobile', displayName?: string) {
  await s.auth.requestOtp(email, client, '1.2.3.4');
  const { code } = s.mailer.last();
  return s.auth.verifyOtp({ email, code, client, displayName });
}

const rejects = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiException);
  expect((err as ApiException).code).toBe(code);
  return err as ApiException;
};

describe('email one-time code', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('sends a six-digit code and stores only a keyed hash of it', async () => {
    const r = await s.auth.requestOtp('asha@example.com', 'mobile', '1.2.3.4');
    expect(r).toEqual({ sent: true, expiresInS: 600, resendAfterS: 60 });
    const { code } = s.mailer.last();
    expect(code).toMatch(/^\d{6}$/);
    const stored = s.repo.otps[0]!;
    expect(stored.codeHash).toBe(hashOtp('unit-test-secret-0123456789', 'asha@example.com', code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('a new email becomes a citizen account and gets a session', async () => {
    const res = await signIn(s, 'asha@example.com', 'mobile', 'Asha');
    expect(res.user).toMatchObject({ email: 'asha@example.com', role: 'citizen', displayName: 'Asha' });
    expect(res.token.startsWith('vws_')).toBe(true);
    expect(new Date(res.expiresAt).getTime() - now.getTime()).toBe(30 * 86400 * 1000);
    const stored = [...s.repo.sessions.values()][0]!;
    expect(stored.tokenHash).not.toContain(res.token);
  });

  it('strips control characters from the display name', async () => {
    const res = await signIn(s, 'asha@example.com', 'mobile', 'As\u0000ha\u0007');
    expect(res.user.displayName).toBe('Asha');
  });

  it('a code works once', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const { code } = s.mailer.last();
    await s.auth.verifyOtp({ email: 'asha@example.com', code, client: 'mobile' });
    await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code, client: 'mobile' }), 'UNAUTHORIZED');
  });

  it('a code expires', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const { code } = s.mailer.last();
    advance(601);
    await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code, client: 'mobile' }), 'UNAUTHORIZED');
  });

  it('five wrong guesses lock the code, even if the sixth is right', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const { code } = s.mailer.last();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code: wrong, client: 'mobile' }), 'UNAUTHORIZED');
    await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code, client: 'mobile' }), 'UNAUTHORIZED');
  });

  it('a code for one email does not work for another', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const { code } = s.mailer.last();
    await rejects(s.auth.verifyOtp({ email: 'ravi@example.com', code, client: 'mobile' }), 'UNAUTHORIZED');
  });

  it('only the newest code works', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const first = s.mailer.last().code;
    advance(61);
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const second = s.mailer.last().code;
    if (first !== second) await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code: first, client: 'mobile' }), 'UNAUTHORIZED');
    // the failed guess above used an attempt on the newest code; the right one still works
    await expect(s.auth.verifyOtp({ email: 'asha@example.com', code: second, client: 'mobile' })).resolves.toBeTruthy();
  });

  it('enforces a resend cooldown, an hourly cap per email, and a cap per network', async () => {
    await s.auth.requestOtp('asha@example.com', 'mobile', '9.9.9.9');
    const e = await rejects(s.auth.requestOtp('asha@example.com', 'mobile', '9.9.9.9'), 'RATE_LIMITED');
    expect((e.details as { retryAfterS: number }).retryAfterS).toBe(60);
    for (let i = 0; i < 4; i++) {
      advance(61);
      await s.auth.requestOtp('asha@example.com', 'mobile', '9.9.9.9');
    }
    advance(61);
    await rejects(s.auth.requestOtp('asha@example.com', 'mobile', '9.9.9.9'), 'RATE_LIMITED');
    advance(3600);
    await expect(s.auth.requestOtp('asha@example.com', 'mobile', '9.9.9.9')).resolves.toBeTruthy();

    const t = setup({ OTP_MAX_PER_IP_PER_HOUR: '3' });
    for (let i = 0; i < 3; i++) await t.auth.requestOtp(`u${i}@example.com`, 'web', '5.5.5.5');
    await rejects(t.auth.requestOtp('u9@example.com', 'web', '5.5.5.5'), 'RATE_LIMITED');
  });

  it('answers the same for emails with and without an account', async () => {
    await signIn(s, 'asha@example.com', 'mobile');
    advance(61);
    const known = await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const unknown = await s.auth.requestOtp('nobody@example.com', 'mobile', null);
    expect(known).toEqual(unknown);
  });

  it('reports a mail failure without leaking the code', async () => {
    s.mailer.fail = true;
    const e = await rejects(s.auth.requestOtp('asha@example.com', 'mobile', null), 'INTERNAL');
    expect(JSON.stringify(e.getResponse())).not.toMatch(/\d{6}/);
  });
});

describe('roles and clients', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('ADMIN_EMAILS signs in as admin on the web and is refused on the phone', async () => {
    const res = await signIn(s, ADMIN, 'web');
    expect(res.user.role).toBe('admin');
    advance(61);
    await s.auth.requestOtp(ADMIN, 'mobile', null);
    const e = await rejects(s.auth.verifyOtp({ email: ADMIN, code: s.mailer.last().code, client: 'mobile' }), 'FORBIDDEN');
    expect(e.message).toMatch(/web console/);
    expect(e.details).toEqual({ reason: 'wrong_client' });
  });

  it('a pre-created operator may use the web console but not the phone app', async () => {
    await s.auth.createUser('op@example.com', 'operator');
    expect((await signIn(s, 'op@example.com', 'web')).user.role).toBe('operator');
    advance(61);
    await s.auth.requestOtp('op@example.com', 'mobile', null);
    await rejects(s.auth.verifyOtp({ email: 'op@example.com', code: s.mailer.last().code, client: 'mobile' }), 'FORBIDDEN');
  });

  it('a citizen may use both the phone and the web report page', async () => {
    expect((await signIn(s, 'asha@example.com', 'mobile')).user.role).toBe('citizen');
    advance(61);
    expect((await signIn(s, 'asha@example.com', 'web')).user.role).toBe('citizen');
  });

  it('a disabled account cannot sign in and its sessions stop working', async () => {
    const admin = await signIn(s, ADMIN, 'web');
    const citizen = await signIn(s, 'asha@example.com', 'mobile');
    await s.auth.updateUser(admin.user.id, citizen.user.id, { disabled: true });
    expect(await s.auth.authenticate(citizen.token)).toBeNull();
    advance(61);
    await s.auth.requestOtp('asha@example.com', 'mobile', null);
    const e = await rejects(s.auth.verifyOtp({ email: 'asha@example.com', code: s.mailer.last().code, client: 'mobile' }), 'FORBIDDEN');
    expect(e.details).toEqual({ reason: 'disabled' });
  });

  it('a role change takes effect on the next request', async () => {
    const admin = await signIn(s, ADMIN, 'web');
    s.repo.users.forEach(() => undefined);
    const op = await s.auth.createUser('op@example.com', 'operator');
    const opSession = await signIn(s, 'op@example.com', 'web');
    expect((await s.auth.authenticate(opSession.token))?.user.role).toBe('operator');
    await s.auth.updateUser(admin.user.id, op.id, { role: 'citizen' });
    expect((await s.auth.authenticate(opSession.token))?.user.role).toBe('citizen');
  });

  it('a staff session on the phone is rejected even with a valid token', async () => {
    const op = await s.auth.createUser('op@example.com', 'operator');
    const web = await signIn(s, 'op@example.com', 'web');
    // Someone gives the operator's web session a mobile client label: still refused.
    const row = [...s.repo.sessions.values()].find((x) => x.userId === op.id)!;
    row.client = 'mobile';
    expect(await s.auth.authenticate(web.token)).toBeNull();
  });
});

describe('sessions', () => {
  it('web sessions last 12 hours, expire, and stop on logout', async () => {
    const s = setup();
    const res = await signIn(s, 'asha@example.com', 'web');
    expect(new Date(res.expiresAt).getTime() - now.getTime()).toBe(12 * 3600 * 1000);
    const ctx = await s.auth.authenticate(res.token);
    expect(ctx?.user.email).toBe('asha@example.com');
    await s.auth.logout(ctx!.sessionId);
    expect(await s.auth.authenticate(res.token)).toBeNull();

    advance(61);
    const again = await signIn(s, 'asha@example.com', 'web');
    advance(12 * 3600 + 1);
    expect(await s.auth.authenticate(again.token)).toBeNull();
  });

  it('rejects tokens that are unknown, malformed or hold the raw operator token', async () => {
    const s = setup();
    expect(await s.auth.authenticate('nope')).toBeNull();
    expect(await s.auth.authenticate('vws_' + 'a'.repeat(43))).toBeNull();
    expect(await s.auth.authenticate(OP_TOKEN)).toBeNull();
  });
});

describe('admin management', () => {
  it('cannot change your own account or remove the last active admin', async () => {
    const s = setup();
    const a = await signIn(s, ADMIN, 'web');
    await rejects(s.auth.updateUser(a.user.id, a.user.id, { role: 'citizen' }), 'CONFLICT');
    const second = await s.auth.createUser('two@example.com', 'admin');
    // Two active admins: removing one is allowed.
    await s.auth.updateUser(a.user.id, second.id, { role: 'operator' });
    // One left: a request from anyone else (for example a stale session) cannot remove or disable it.
    await rejects(s.auth.updateUser('someone-else', a.user.id, { role: 'citizen' }), 'CONFLICT');
    await rejects(s.auth.updateUser('someone-else', a.user.id, { disabled: true }), 'CONFLICT');
    expect((await s.auth.authenticate(a.token))?.user.role).toBe('admin');
  });

  it('refuses a duplicate email and an unknown user', async () => {
    const s = setup();
    await s.auth.createUser('op@example.com', 'operator');
    await rejects(s.auth.createUser('op@example.com', 'admin'), 'CONFLICT');
    await rejects(s.auth.updateUser('x', 'missing', { role: 'admin' }), 'NOT_FOUND');
  });
});

describe('OperatorGuard', () => {
  const ctxFor = (authorization?: string): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }) }) as unknown as ExecutionContext;

  it('accepts the shared operator token, operator and admin sessions; refuses citizens, nothing and wrong tokens', async () => {
    const s = setup();
    const guard = new OperatorGuard(s.config, s.auth);
    expect(await guard.canActivate(ctxFor(`Bearer ${OP_TOKEN}`))).toBe(true);

    await s.auth.createUser('op@example.com', 'operator');
    const op = await signIn(s, 'op@example.com', 'web');
    expect(await guard.canActivate(ctxFor(`Bearer ${op.token}`))).toBe(true);

    const admin = await signIn(s, ADMIN, 'web');
    expect(await guard.canActivate(ctxFor(`Bearer ${admin.token}`))).toBe(true);

    const citizen = await signIn(s, 'asha@example.com', 'web');
    await expect(guard.canActivate(ctxFor(`Bearer ${citizen.token}`))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(guard.canActivate(ctxFor())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(guard.canActivate(ctxFor('Bearer wrong'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('with OPERATOR_TOKEN unset, only staff sessions work', async () => {
    const s = setup({ OPERATOR_TOKEN: '' });
    const guard = new OperatorGuard(s.config, s.auth);
    await expect(guard.canActivate(ctxFor('Bearer anything'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const admin = await signIn(s, ADMIN, 'web');
    expect(await guard.canActivate(ctxFor(`Bearer ${admin.token}`))).toBe(true);
  });
});

describe('optional identity for reports', () => {
  it('is null for no header, a stale token and the operator token; a user for a live session', async () => {
    const s = setup();
    const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as never;
    expect(await optionalAuth(s.auth, req())).toBeNull();
    expect(await optionalAuth(s.auth, req('Bearer vws_stale'))).toBeNull();
    expect(await optionalAuth(s.auth, req(`Bearer ${OP_TOKEN}`))).toBeNull();
    const res = await signIn(s, 'asha@example.com', 'mobile');
    expect((await optionalAuth(s.auth, req(`Bearer ${res.token}`)))?.user.email).toBe('asha@example.com');
  });
});
