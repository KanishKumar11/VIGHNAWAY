import { vi } from 'vitest';
import type { AdminUser, AuthSessionResponse, AuthUser, Role } from '@vighnaway/contracts';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}
export type Reply = { status?: number; body?: unknown } | undefined;

/**
 * Replaces global fetch. The handler sees every request (path without the host) and returns the
 * reply; an undefined reply is a 404 so a missing route fails loudly.
 */
export function stubFetch(handler: (call: Call) => Reply | Promise<Reply>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const call: Call = {
      method: init.method ?? 'GET',
      path,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply = await handler(call);
    if (!reply) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `no stub for ${path}` } }), { status: 404 });
    const status = reply.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(reply.body ?? {}), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

export const apiError = (status: number, code: string, message: string, details?: unknown): Reply => ({
  status,
  body: { error: { code, message, ...(details === undefined ? {} : { details }) } },
});

export const makeUser = (role: Role, email = `${role}@example.org`, id = `u-${role}`): AuthUser => ({ id, email, role, displayName: null });

export const makeSession = (role: Role, over: Partial<AuthSessionResponse> = {}): AuthSessionResponse => ({
  token: `tok-${role}`,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: makeUser(role),
  ...over,
});

export const makeAdminUser = (role: Role, email: string, over: Partial<AdminUser> = {}): AdminUser => ({
  ...makeUser(role, email, `id-${email}`),
  disabled: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastLoginAt: null,
  ...over,
});

/** A clean slate: no session, no demo token, empty sessionStorage. */
export function resetAuth() {
  window.sessionStorage.clear();
  useSession.setState({ token: null, expiresAt: null, user: null, hydrated: false, statsNonce: 0 });
  useOperator.setState({ token: null, dialogOpen: false });
}

/** Signed in without touching the network (setSession marks the store hydrated). */
export function signInAs(role: Role, over: Partial<AuthSessionResponse> = {}) {
  resetAuth();
  const s = makeSession(role, over);
  useSession.getState().setSession(s);
  return s;
}
