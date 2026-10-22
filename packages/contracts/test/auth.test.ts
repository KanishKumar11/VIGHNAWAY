import { describe, expect, it } from 'vitest';
import {
  AdminUpdateUserBodySchema,
  ERROR_STATUS,
  OtpRequestBodySchema,
  OtpVerifyBodySchema,
  ROLES,
  ROLE_CLIENTS,
  canSignInOn,
  isStaffRole,
} from '../src';

describe('auth contracts', () => {
  it('only citizens may sign in on the phone; staff use the web console', () => {
    expect(canSignInOn('citizen', 'mobile')).toBe(true);
    expect(canSignInOn('citizen', 'web')).toBe(true);
    expect(canSignInOn('operator', 'web')).toBe(true);
    expect(canSignInOn('operator', 'mobile')).toBe(false);
    expect(canSignInOn('admin', 'web')).toBe(true);
    expect(canSignInOn('admin', 'mobile')).toBe(false);
  });

  it('every role has at least one client, and staff roles are operator and admin', () => {
    for (const r of ROLES) expect(ROLE_CLIENTS[r].length).toBeGreaterThan(0);
    expect(ROLES.filter(isStaffRole)).toEqual(['operator', 'admin']);
  });

  it('FORBIDDEN is 403', () => {
    expect(ERROR_STATUS.FORBIDDEN).toBe(403);
  });

  it('normalises emails and rejects bad ones', () => {
    const ok = OtpRequestBodySchema.parse({ email: '  Asha@Example.COM ', client: 'mobile' });
    expect(ok.email).toBe('asha@example.com');
    expect(OtpRequestBodySchema.safeParse({ email: 'not-an-email', client: 'web' }).success).toBe(false);
    expect(OtpRequestBodySchema.safeParse({ email: 'a@b.co', client: 'tv' }).success).toBe(false);
    expect(OtpRequestBodySchema.safeParse({ email: 'a@b.co', client: 'web', extra: 1 }).success).toBe(false);
  });

  it('codes are exactly six digits', () => {
    const base = { email: 'a@b.co', client: 'web' as const };
    expect(OtpVerifyBodySchema.safeParse({ ...base, code: '123456' }).success).toBe(true);
    expect(OtpVerifyBodySchema.safeParse({ ...base, code: ' 123456 ' }).success).toBe(true);
    for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
      expect(OtpVerifyBodySchema.safeParse({ ...base, code }).success).toBe(false);
    }
  });

  it('an admin update must change something', () => {
    expect(AdminUpdateUserBodySchema.safeParse({}).success).toBe(false);
    expect(AdminUpdateUserBodySchema.safeParse({ role: 'operator' }).success).toBe(true);
    expect(AdminUpdateUserBodySchema.safeParse({ disabled: true }).success).toBe(true);
    expect(AdminUpdateUserBodySchema.safeParse({ role: 'root' }).success).toBe(false);
  });
});
