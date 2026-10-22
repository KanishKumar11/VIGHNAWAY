import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOperatorCredential, resolveCredential } from '@/lib/credential';
import { useOperator } from '@/stores/operator';
import { activeSession, useSession } from '@/stores/session';
import { apiError, makeSession, makeUser, resetAuth, signInAs, stubFetch } from './authHelpers';

const STORAGE_KEY = 'vighnaway.session';
const store = (s: unknown) => window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));

beforeEach(() => resetAuth());
afterEach(() => {
  useSession.getState().clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('session store', () => {
  it('hydrates a stored session, then validates it with GET /auth/me and takes the server role', async () => {
    const s = makeSession('operator');
    store(s);
    const { calls } = stubFetch((c) => (c.path === '/auth/me' ? { body: { user: { ...s.user, role: 'admin' }, client: 'web' } } : undefined));
    const done = useSession.getState().hydrate();
    // Available at once, before the network answers.
    expect(useSession.getState()).toMatchObject({ hydrated: true, token: s.token });
    await done;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${s.token}`);
    expect(useSession.getState().user?.role).toBe('admin');
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!).user.role).toBe('admin');
  });

  it('drops a session whose expiresAt has passed without calling the API', async () => {
    store(makeSession('operator', { expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const { fn } = stubFetch(() => undefined);
    await useSession.getState().hydrate();
    expect(fn).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ hydrated: true, token: null, user: null });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears the session when /auth/me answers 401', async () => {
    store(makeSession('citizen'));
    stubFetch(() => apiError(401, 'UNAUTHORIZED', 'Sign in again'));
    await useSession.getState().hydrate();
    expect(useSession.getState()).toMatchObject({ hydrated: true, token: null, user: null });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the session when the network is down (a failed check is not a rejection)', async () => {
    store(makeSession('citizen'));
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await useSession.getState().hydrate();
    expect(useSession.getState().token).toBe('tok-citizen');
  });

  it('ignores a stored value that is not a valid session', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{"token":"x"');
    const { fn } = stubFetch(() => undefined);
    await useSession.getState().hydrate();
    expect(fn).not.toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ hydrated: true, token: null });
    store({ token: 't', expiresAt: new Date(Date.now() + 1e6).toISOString(), user: { id: 1 } });
    useSession.setState({ hydrated: false });
    await useSession.getState().hydrate();
    expect(useSession.getState().token).toBeNull();
  });

  it('expires on its own when expiresAt passes', () => {
    vi.useFakeTimers();
    useSession.getState().setSession(makeSession('operator', { expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(activeSession()).not.toBeNull();
    vi.advanceTimersByTime(60_001);
    expect(useSession.getState().token).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('activeSession refuses an expired session even if the timer has not fired yet', () => {
    useSession.setState({ token: 't', user: makeUser('admin'), expiresAt: new Date(Date.now() - 5).toISOString(), hydrated: true });
    expect(activeSession()).toBeNull();
    expect(useSession.getState().token).toBeNull();
  });

  it('signOut calls /auth/logout with the token and clears locally, even if the call fails', async () => {
    signInAs('operator');
    const { calls } = stubFetch(() => apiError(500, 'INTERNAL', 'boom'));
    await useSession.getState().signOut();
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/logout' });
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-operator');
    expect(useSession.getState()).toMatchObject({ token: null, user: null });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('operator credential resolver', () => {
  it('prefers an operator or admin session over the demo token', () => {
    useOperator.setState({ token: 'demo-token' });
    signInAs('operator');
    useOperator.setState({ token: 'demo-token' });
    expect(getOperatorCredential()).toEqual({ kind: 'session', token: 'tok-operator' });
    signInAs('admin');
    expect(getOperatorCredential()).toEqual({ kind: 'session', token: 'tok-admin' });
  });

  it('falls back to the demo token when nobody staff is signed in', () => {
    useOperator.setState({ token: 'demo-token' });
    expect(getOperatorCredential()).toEqual({ kind: 'token', token: 'demo-token' });
  });

  it('never uses a citizen session as an operator credential', () => {
    signInAs('citizen');
    expect(getOperatorCredential()).toBeNull();
    useOperator.setState({ token: 'demo-token' });
    expect(getOperatorCredential()).toEqual({ kind: 'token', token: 'demo-token' });
  });

  it('is null with nothing, and ignores an expired session', () => {
    expect(getOperatorCredential()).toBeNull();
    signInAs('operator', { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(getOperatorCredential()).toBeNull();
  });

  it('the pure resolver decides the same way', () => {
    expect(resolveCredential({ token: 'a', role: 'operator' }, 'b')).toEqual({ kind: 'session', token: 'a' });
    expect(resolveCredential({ token: 'a', role: 'citizen' }, null)).toBeNull();
    expect(resolveCredential({ token: null, role: null }, 'b')).toEqual({ kind: 'token', token: 'b' });
  });
});
