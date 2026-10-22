import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { findForbiddenWords, type AuthUser, type ReportInput } from '@vighnaway/contracts';
import { AccountScreen } from '@/features/account/AccountScreen';
import { statsLines } from '@/features/account/signIn';
import { flushPendingReports } from '@/features/live/liveSync';
import { submitReport } from '@/features/report/submit';
import { en } from '@/i18n/en';
import { hi } from '@/i18n/hi';
import { mr } from '@/i18n/mr';
import { api, retryAfterSeconds, ApiRequestError } from '@/lib/api';
import { KEYS, storage } from '@/lib/storage';
import { authToken, isExpired, selectSignedIn, startAuth, useAuth } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { usePendingReports } from '@/stores/reports';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

const API = 'http://api.test';
const TOKEN = 'tok-secret-123';
const user: AuthUser = { id: 'u1', email: 'asha@example.com', role: 'citizen', displayName: 'Asha' };
const future = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
let calls: Call[] = [];
type Reply = { status: number; body?: unknown } | 'network';
let handler: (call: Call) => Reply;

const reply = (status: number, body?: unknown): Reply => ({ status, body });
const err = (status: number, code: string, message: string, details?: unknown): Reply =>
  reply(status, { error: { code, message, ...(details === undefined ? null : { details }) } });

beforeEach(() => {
  calls = [];
  handler = () => reply(500);
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url).replace(API, ''),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = handler(call);
    if (r === 'network') throw new TypeError('Network request failed');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => (r.body === undefined ? Promise.reject(new Error('no body')) : r.body) } as Response;
  }) as unknown as typeof fetch;
  useSettings.setState({ apiUrl: API });
  useConnection.setState({ net: 'online' });
  useAuth.getState().clearLocal();
  usePendingReports.setState({ pending: [] });
});

const signIn = (over: Partial<{ expiresAt: string; user: AuthUser }> = {}) =>
  useAuth.getState().setSession({ token: TOKEN, expiresAt: over.expiresAt ?? future(), user: over.user ?? user });

describe('auth store', () => {
  it('setSession persists the token with the server that issued it and signs in', () => {
    signIn();
    expect(selectSignedIn(useAuth.getState())).toBe(true);
    expect(authToken()).toBe(TOKEN);
    expect(storage.getJSON<{ token: string; server: string }>(KEYS.auth)).toMatchObject({ token: TOKEN, server: API });
  });

  it('hydrate validates with GET /auth/me (Bearer) and refreshes the user', async () => {
    signIn();
    handler = () => reply(200, { user: { ...user, displayName: 'Asha K' }, client: 'mobile' });
    await useAuth.getState().hydrate();
    expect(calls[0]).toMatchObject({ url: '/auth/me', method: 'GET' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(useAuth.getState().user?.displayName).toBe('Asha K');
    expect(storage.getJSON<{ user: AuthUser }>(KEYS.auth)?.user.displayName).toBe('Asha K');
  });

  it('a 401 from /auth/me clears the session on the phone', async () => {
    signIn();
    handler = () => err(401, 'UNAUTHORIZED', 'Sign in to continue');
    await useAuth.getState().hydrate();
    expect(useAuth.getState().token).toBeNull();
    expect(selectSignedIn(useAuth.getState())).toBe(false);
    expect(storage.getString(KEYS.auth)).toBeUndefined();
  });

  it('a network failure or a server error keeps the cached user signed in', async () => {
    signIn();
    handler = () => 'network';
    await useAuth.getState().hydrate();
    expect(selectSignedIn(useAuth.getState())).toBe(true);
    handler = () => err(500, 'INTERNAL', 'boom');
    await useAuth.getState().hydrate();
    expect(selectSignedIn(useAuth.getState())).toBe(true);
    expect(useAuth.getState().user?.email).toBe(user.email);
  });

  it('offline: no request is made and the cached user stays signed in', async () => {
    signIn();
    useConnection.setState({ net: 'offline' });
    await useAuth.getState().hydrate();
    expect(calls).toHaveLength(0);
    expect(selectSignedIn(useAuth.getState())).toBe(true);
  });

  it('an expired session is dropped without a request, and is never sent with a report', async () => {
    signIn({ expiresAt: past() });
    expect(isExpired(useAuth.getState().expiresAt)).toBe(true);
    expect(authToken()).toBeNull();
    await useAuth.getState().hydrate();
    expect(calls).toHaveLength(0);
    expect(useAuth.getState().token).toBeNull();
  });

  // A fresh module registry is a fresh process start: seed the storage the store will read, then import it.
  const atStart = (saved: object, check: (auth: typeof import('@/stores/auth'), store: typeof import('@/lib/storage')) => void) =>
    jest.isolateModules(() => {
      const fresh = require('@/lib/storage') as typeof import('@/lib/storage');
      fresh.storage.setJSON(fresh.KEYS.auth, saved);
      check(require('@/stores/auth') as typeof import('@/stores/auth'), fresh);
    });

  it('an expired session saved on the phone is dropped at start', () => {
    atStart({ token: TOKEN, expiresAt: past(), user, server: API }, (auth, st) => {
      expect(auth.useAuth.getState().token).toBeNull();
      expect(st.storage.getString(st.KEYS.auth)).toBeUndefined();
    });
  });

  it('a valid session saved on the phone is restored at start', () => {
    atStart({ token: TOKEN, expiresAt: future(), user, server: API }, (auth) => {
      expect(auth.useAuth.getState().user?.email).toBe(user.email);
      expect(auth.useAuth.getState().token).toBe(TOKEN);
    });
  });

  it('a malformed saved session is ignored', () => {
    atStart({ token: 5, user: 'x' }, (auth) => expect(auth.useAuth.getState().token).toBeNull());
  });

  it('a session from another server is not used and never sent there', async () => {
    signIn();
    useSettings.setState({ apiUrl: 'http://other.test' });
    expect(authToken()).toBeNull();
    await useAuth.getState().hydrate();
    expect(calls).toHaveLength(0);
    expect(useAuth.getState().token).toBeNull();
  });

  it('a staff role from /auth/me signs the phone out (the app is for citizens)', async () => {
    signIn();
    handler = () => reply(200, { user: { ...user, role: 'operator' }, client: 'mobile' });
    await useAuth.getState().hydrate();
    expect(useAuth.getState().token).toBeNull();
  });

  it('signOut clears locally and calls /auth/logout; a failed call still signs out', async () => {
    signIn();
    handler = () => reply(204);
    await useAuth.getState().signOut();
    expect(calls[0]).toMatchObject({ url: '/auth/logout', method: 'POST' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(useAuth.getState().token).toBeNull();
    signIn();
    handler = () => 'network';
    await useAuth.getState().signOut();
    expect(useAuth.getState().token).toBeNull();
    expect(storage.getString(KEYS.auth)).toBeUndefined();
  });

  it('startAuth revalidates when the network returns', async () => {
    signIn();
    useConnection.setState({ net: 'offline' });
    handler = () => reply(200, { user, client: 'mobile' });
    const stop = startAuth();
    expect(calls).toHaveLength(0);
    await act(async () => {
      useConnection.setState({ net: 'online' });
    });
    expect(calls.map((c) => c.url)).toEqual(['/auth/me']);
    stop();
  });

  it('never writes the token to the console', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    signIn();
    handler = () => 'network';
    await useAuth.getState().hydrate();
    await useAuth.getState().signOut();
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain(TOKEN);
      s.mockRestore();
    }
  });
});

describe('reports send the token only when signed in', () => {
  const input: ReportInput = { type: 'flood', depth: 'knee', point: { lat: 19.1, lng: 72.8 }, observedPersonally: true, deviceId: 'vw-test-device-01' };
  const ok = reply(200, {
    receipt: { reportId: 'r-1', scenarioId: 'andheri-monsoon', outcome: 'created_incident', receivedAtS: 10, snappedEdgeId: 'e1', roadName: null, distanceToRoadM: 3 },
    incident: null,
  });
  const reportCalls = () => calls.filter((c) => c.url.endsWith('/reports'));

  it('signed out: no Authorization header (anonymous, as before)', async () => {
    handler = () => ok;
    expect(await submitReport(input)).toMatchObject({ kind: 'sent' });
    expect(reportCalls()).toHaveLength(1);
    expect(reportCalls()[0]!.headers.Authorization).toBeUndefined();
  });

  it('signed in: the Bearer token goes with the report', async () => {
    signIn();
    handler = () => ok;
    expect(await submitReport(input)).toMatchObject({ kind: 'sent' });
    expect(reportCalls()[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(reportCalls()[0]!.body).toMatchObject({ type: 'flood', deviceId: 'vw-test-device-01' });
  });

  it('a rejected token never fails the report: it is sent again anonymously', async () => {
    signIn();
    handler = (c) => (c.headers.Authorization ? err(401, 'UNAUTHORIZED', 'Sign in to continue') : ok);
    expect(await submitReport(input)).toMatchObject({ kind: 'sent' });
    expect(reportCalls()).toHaveLength(2);
    expect(reportCalls()[1]!.headers.Authorization).toBeUndefined();
  });

  it('an expired session sends the report anonymously', async () => {
    signIn({ expiresAt: past() });
    handler = () => ok;
    await submitReport(input);
    expect(reportCalls()[0]!.headers.Authorization).toBeUndefined();
  });

  it('queued reports are sent with the token when they flush after sign-in', async () => {
    usePendingReports.getState().enqueue({ localId: 'p1', scenarioId: 'andheri-monsoon', input, createdAtWallMs: 1, activityId: null });
    signIn();
    handler = () => ok;
    await flushPendingReports();
    expect(reportCalls()[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(usePendingReports.getState().pending).toHaveLength(0);
  });

  it('signing in is not needed offline: the report is queued as before', async () => {
    useConnection.setState({ net: 'offline' });
    expect(await submitReport(input)).toEqual({ kind: 'pending' });
    expect(calls).toHaveLength(0);
  });
});

describe('api errors', () => {
  it('reads retryAfterS from a 429', async () => {
    handler = () => err(429, 'RATE_LIMITED', 'Wait 42 seconds before asking for another code', { retryAfterS: 42 });
    const e = await api.authOtpRequest(API, { email: 'a@b.co', client: 'mobile' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiRequestError);
    expect(retryAfterSeconds(e)).toBe(42);
    expect(retryAfterSeconds(new Error('x'))).toBeNull();
  });
});

describe('Account screen: sign in', () => {
  const type = async (id: string, value: string) => fireEvent.changeText(screen.getByTestId(id), value);

  const requestOk = reply(200, { sent: true, expiresInS: 600, resendAfterS: 30 });
  const sessionOk = reply(200, { token: TOKEN, expiresAt: future(), user });

  it('renders signed out: email field, Send code, and the "no account needed" copy', async () => {
    await render(<AccountScreen />);
    expect(screen.getByTestId('account-email')).toBeTruthy();
    expect(screen.getByText('Send code')).toBeTruthy();
    expect(screen.getByText(en.accountSignedOutBody)).toBeTruthy();
  });

  it('email -> code -> signed in, with the right requests and a visible resend countdown', async () => {
    jest.useFakeTimers();
    try {
      handler = (c) => (c.url === '/auth/otp/request' ? requestOk : sessionOk);
      await render(<AccountScreen />);
      await type('account-email', '  Asha@Example.com ');
      await type('account-name', ' Asha ');
      expect(screen.getByText('Step 1 of 2')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('account-send'));
      expect(calls[0]).toMatchObject({ url: '/auth/otp/request', method: 'POST', body: { email: 'asha@example.com', client: 'mobile' } });
      // Code step: a one-time-code numeric field, the countdown and the name field.
      const code = screen.getByTestId('account-code');
      expect(code.props.textContentType).toBe('oneTimeCode');
      expect(['sms-otp', 'one-time-code']).toContain(code.props.autoComplete);
      expect(code.props.keyboardType).toBe('number-pad');
      expect(code.props.maxLength).toBe(6);
      expect(screen.getByText('Resend code in 30s')).toBeTruthy();
      expect(screen.getByText('Step 2 of 2')).toBeTruthy();
      expect(screen.queryByTestId('account-name')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText('Resend code in 27s')).toBeTruthy();

      await type('account-code', '12a3456789');
      expect(screen.getByTestId('account-code').props.value).toBe('123456');
      await fireEvent.press(screen.getByTestId('account-verify'));
      expect(calls[1]).toMatchObject({
        url: '/auth/otp/verify',
        body: { email: 'asha@example.com', code: '123456', client: 'mobile', displayName: 'Asha' },
      });
      expect(selectSignedIn(useAuth.getState())).toBe(true);
      expect(useAuth.getState().token).toBe(TOKEN);
      expect(useToast.getState().toast?.message).toBe('Signed in');
    } finally {
      jest.useRealTimers();
    }
  });

  it('omits displayName when the name is left empty', async () => {
    handler = (c) => (c.url === '/auth/otp/request' ? requestOk : sessionOk);
    await render(<AccountScreen />);
    await type('account-email', 'asha@example.com');
    await fireEvent.press(screen.getByTestId('account-send'));
    await type('account-code', '123456');
    await fireEvent.press(screen.getByTestId('account-verify'));
    expect(calls[1]!.body).toEqual({ email: 'asha@example.com', code: '123456', client: 'mobile' });
  });

  it('shows the generic invalid-code message for a 401 and stays signed out', async () => {
    handler = (c) => (c.url === '/auth/otp/request' ? requestOk : err(401, 'UNAUTHORIZED', 'That code is not valid or has expired. Ask for a new one.'));
    await render(<AccountScreen />);
    await type('account-email', 'asha@example.com');
    await fireEvent.press(screen.getByTestId('account-send'));
    await type('account-code', '000000');
    await fireEvent.press(screen.getByTestId('account-verify'));
    expect(screen.getByText('That code is not valid or has expired. Ask for a new one.')).toBeTruthy();
    expect(selectSignedIn(useAuth.getState())).toBe(false);
    expect(screen.getByTestId('account-code').props.value).toBe('');
  });

  it('a 429 with retryAfterS goes to the code step and counts down before another code', async () => {
    jest.useFakeTimers();
    try {
      handler = () => err(429, 'RATE_LIMITED', 'Wait 42 seconds before asking for another code', { retryAfterS: 42 });
      await render(<AccountScreen />);
      await type('account-email', 'asha@example.com');
      await fireEvent.press(screen.getByTestId('account-send'));
      expect(screen.getByTestId('account-code')).toBeTruthy();
      expect(screen.getByText('Resend code in 42s')).toBeTruthy();
      expect(screen.getByTestId('account-info').props.children).toContain('a moment ago');
      expect(screen.getByTestId('account-resend').props.accessibilityState.disabled).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(42_000);
      });
      expect(screen.getByText('Resend code')).toBeTruthy();
      expect(screen.getByTestId('account-resend').props.accessibilityState.disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a 429 on Resend shows the wait and restarts the countdown', async () => {
    handler = (c) => (c.url === '/auth/otp/request' && calls.filter((x) => x.url === c.url).length > 1 ? err(429, 'RATE_LIMITED', 'Wait', { retryAfterS: 12 }) : requestOk);
    jest.useFakeTimers();
    try {
      await render(<AccountScreen />);
      await type('account-email', 'asha@example.com');
      await fireEvent.press(screen.getByTestId('account-send'));
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      await fireEvent.press(screen.getByTestId('account-resend'));
      expect(screen.getByText('Please wait 12 seconds before asking for another code.')).toBeTruthy();
      expect(screen.getByText('Resend code in 12s')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a staff account gets its own explanation, not a generic error, and no session is kept', async () => {
    handler = (c) => (c.url === '/auth/otp/request' ? requestOk : err(403, 'FORBIDDEN', 'Staff accounts sign in on the web console, not in the phone app.'));
    await render(<AccountScreen />);
    await type('account-email', 'ops@example.com');
    await fireEvent.press(screen.getByTestId('account-send'));
    await type('account-code', '123456');
    await fireEvent.press(screen.getByTestId('account-verify'));
    expect(screen.getByText('Staff accounts sign in on the web console, not in the phone app.')).toBeTruthy();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(useAuth.getState().token).toBeNull();
  });

  it('a disabled account is explained', async () => {
    handler = (c) => (c.url === '/auth/otp/request' ? requestOk : err(403, 'FORBIDDEN', 'This account is disabled'));
    await render(<AccountScreen />);
    await type('account-email', 'x@example.com');
    await fireEvent.press(screen.getByTestId('account-send'));
    await type('account-code', '123456');
    await fireEvent.press(screen.getByTestId('account-verify'));
    expect(screen.getByText('This account is disabled.')).toBeTruthy();
  });

  it('rejects a malformed email without a request, and handles an unreachable server', async () => {
    await render(<AccountScreen />);
    await type('account-email', 'not-an-email');
    await fireEvent.press(screen.getByTestId('account-send'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(calls).toHaveLength(0);
    handler = () => 'network';
    await type('account-email', 'asha@example.com');
    await fireEvent.press(screen.getByTestId('account-send'));
    expect(screen.getByTestId('account-notice')).toHaveTextContent(new RegExp(`Could not reach ${API}`));
    expect(screen.getByTestId('account-email')).toBeTruthy(); // still on the email step
  });

  it('offline: says so and disables Send code', async () => {
    useConnection.setState({ net: 'offline' });
    await render(<AccountScreen />);
    expect(screen.getByText(en.accountOffline)).toBeTruthy();
    await type('account-email', 'asha@example.com');
    expect(screen.getByTestId('account-send').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Account screen: signed in', () => {
  const BANNED = /\b(score|scores|rank|ranking|points?|badges?|levels?|trust|trusted|reputation|leaderboard)\b|%/i;

  it('shows name, email, the thank-you count (counts only) and Sign out', async () => {
    signIn();
    handler = (c) => (c.url === '/me/stats' ? reply(200, { reports: 3, inVerifiedIncidents: 1 }) : reply(500));
    await render(<AccountScreen />);
    // The name is on the profile card and in the Name row (where it is edited).
    expect(screen.getAllByText('Asha').length).toBeGreaterThan(0);
    expect(screen.getByText('asha@example.com')).toBeTruthy();
    expect(await screen.findByText('You have sent 3 reports. Thank you.')).toBeTruthy();
    expect(screen.getByText('1 report is in an incident an operator later verified.')).toBeTruthy();
    expect(calls.find((c) => c.url === '/me/stats')!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(screen.getByText('Sign out')).toBeTruthy();
    const shown = JSON.stringify(screen.toJSON());
    expect(shown).not.toMatch(BANNED);
    expect(screen.queryByTestId('account-email')).toBeNull();
  });

  it('renames the account: PATCH /me with the trimmed name, kept on the phone; an empty box removes it', async () => {
    signIn();
    handler = (c) => (c.url === '/me' && c.method === 'PATCH' ? reply(200, { user: { ...user, displayName: (c.body as { displayName: string | null }).displayName } }) : c.url === '/me/reports' ? reply(200, { reports: [] }) : reply(200, { reports: 0, inVerifiedIncidents: 0 }));
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account-name-open'));
    await fireEvent.changeText(screen.getByTestId('account-name-edit'), '  Asha K  ');
    await fireEvent.press(screen.getByTestId('account-name-save'));
    await act(async () => undefined);
    expect(calls.find((c) => c.url === '/me' && c.method === 'PATCH')).toMatchObject({ body: { displayName: 'Asha K' } });
    expect(useAuth.getState().user?.displayName).toBe('Asha K');
    expect(storage.getJSON<{ user: AuthUser }>(KEYS.auth)?.user.displayName).toBe('Asha K');
    expect(screen.queryByTestId('account-name-edit')).toBeNull();

    await fireEvent.press(screen.getByTestId('account-name-open'));
    await fireEvent.changeText(screen.getByTestId('account-name-edit'), '   ');
    await fireEvent.press(screen.getByTestId('account-name-save'));
    await act(async () => undefined);
    expect(calls.filter((c) => c.method === 'PATCH').pop()).toMatchObject({ body: { displayName: null } });
    expect(useAuth.getState().user?.displayName).toBeNull();
  });

  it('a failed rename keeps the editor open and says so', async () => {
    signIn();
    handler = (c) => (c.method === 'PATCH' ? err(500, 'INTERNAL', 'boom') : reply(200, { reports: 0, inVerifiedIncidents: 0 }));
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account-name-open'));
    await fireEvent.changeText(screen.getByTestId('account-name-edit'), 'Zed');
    await fireEvent.press(screen.getByTestId('account-name-save'));
    await act(async () => undefined);
    expect(screen.getByTestId('account-name-edit')).toBeTruthy();
    expect(useToast.getState().toast?.message).toBe(en.accountNameError);
    expect(useAuth.getState().user?.displayName).toBe('Asha');
  });

  it('lists the person\'s own reports with what became of each, and the empty, offline and error states', async () => {
    signIn();
    handler = (c) =>
      c.url === '/me/reports'
        ? reply(200, {
            reports: [
              { id: 'r2', type: 'flood', status: 'verified', roadName: 'Andheri Subway', receivedAtS: 600 },
              { id: 'r1', type: 'road_clear', status: null, roadName: null, receivedAtS: 60 },
            ],
          })
        : reply(200, { reports: 2, inVerifiedIncidents: 1 });
    const view = await render(<AccountScreen />);
    expect(await screen.findByTestId('my-report-r2')).toBeTruthy();
    expect(screen.getByText('Flooding')).toBeTruthy();
    expect(screen.getByText('Road clear')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(en.accountReportNoIncident);
    expect(JSON.stringify(screen.toJSON())).toContain('Andheri Subway');
    await view.unmount();

    handler = (c) => (c.url === '/me/reports' ? reply(200, { reports: [] }) : reply(200, { reports: 0, inVerifiedIncidents: 0 }));
    const empty = await render(<AccountScreen />);
    expect(await screen.findByTestId('my-reports-empty')).toBeTruthy();
    await empty.unmount();

    handler = () => err(500, 'INTERNAL', 'boom');
    const bad = await render(<AccountScreen />);
    expect(await screen.findByTestId('my-reports-error')).toBeTruthy();
    await bad.unmount();

    useConnection.setState({ net: 'offline' });
    await render(<AccountScreen />);
    expect(screen.getByTestId('my-reports-offline')).toBeTruthy();
  });

  it('deleting the account asks first, calls DELETE /me, and signs this phone out', async () => {
    signIn();
    handler = (c) => (c.method === 'DELETE' ? reply(204) : reply(200, { reports: 0, inVerifiedIncidents: 0 }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account-delete'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')!.onPress!();
    });
    await act(async () => undefined);
    expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({ url: '/me' });
    expect(useAuth.getState().token).toBeNull();
    alert.mockRestore();
  });

  it('a failed delete keeps the person signed in and says so', async () => {
    signIn();
    handler = (c) => (c.method === 'DELETE' ? err(500, 'INTERNAL', 'boom') : reply(200, { reports: 0, inVerifiedIncidents: 0 }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account-delete'));
    await act(async () => {
      alert.mock.calls[0]![2]!.find((b) => b.style === 'destructive')!.onPress!();
    });
    await act(async () => undefined);
    expect(selectSignedIn(useAuth.getState())).toBe(true);
    expect(useToast.getState().toast?.message).toBe(en.accountDeleteError);
    alert.mockRestore();
  });

  it('shows a loading line, then the count', async () => {
    signIn();
    let release: (r: Reply) => void = () => undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          release = (r) => resolve({ ok: true, status: 200, json: async () => (r as { body: unknown }).body } as Response);
        }),
    ) as unknown as typeof fetch;
    await render(<AccountScreen />);
    expect(screen.getByText(en.accountStatsLoading)).toBeTruthy();
    await act(async () => {
      release(reply(200, { reports: 1, inVerifiedIncidents: 0 }));
    });
    expect(await screen.findByText('You have sent 1 report. Thank you.')).toBeTruthy();
  });

  it('offline: falls back to a quiet line and makes no stats request; still signed in', async () => {
    signIn();
    useConnection.setState({ net: 'offline' });
    await render(<AccountScreen />);
    expect(screen.getByText(en.accountStatsOffline)).toBeTruthy();
    expect(calls).toHaveLength(0);
    expect(screen.getByText('asha@example.com')).toBeTruthy();
  });

  it('a failed stats call shows a calm error and keeps the user signed in', async () => {
    signIn();
    handler = () => err(500, 'INTERNAL', 'boom');
    await render(<AccountScreen />);
    expect(await screen.findByText(en.accountStatsError)).toBeTruthy();
    expect(selectSignedIn(useAuth.getState())).toBe(true);
  });

  it('a 401 on stats revalidates and signs the phone out', async () => {
    signIn();
    handler = () => err(401, 'UNAUTHORIZED', 'Sign in to continue');
    await render(<AccountScreen />);
    await act(async () => undefined);
    await act(async () => undefined);
    expect(useAuth.getState().token).toBeNull();
  });

  it('with no reports yet, says how they get counted', async () => {
    signIn();
    handler = () => reply(200, { reports: 0, inVerifiedIncidents: 0 });
    await render(<AccountScreen />);
    expect(await screen.findByText(en.accountStatsNone)).toBeTruthy();
  });

  it('statsLines: counts only, in every language, no score or rank words, no forbidden words', () => {
    const cases = [
      { reports: 0, inVerifiedIncidents: 0 },
      { reports: 1, inVerifiedIncidents: 1 },
      { reports: 7, inVerifiedIncidents: 2 },
    ];
    for (const c of cases) {
      const lines = statsLines(c);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toMatch(BANNED);
        expect(findForbiddenWords(line)).toEqual([]);
      }
    }
    expect(statsLines({ reports: 7, inVerifiedIncidents: 2 })[0]).toContain('7');
    const all = Object.entries(en).filter(([k]) => k.startsWith('account')).map(([, v]) => String(v));
    for (const s of all) expect(s).not.toMatch(BANNED);
  });
});

describe('account strings', () => {
  it('hi and mr have every account key with the same placeholders', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('account') || k === 'drawerAccount' || k === 'settingsAccount') as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThan(30);
    const holders = (s: unknown) => (String(s).match(/\{\w+\}/g) ?? []).sort();
    for (const k of keys) {
      for (const dict of [hi, mr] as Record<string, unknown>[]) {
        expect([k, typeof dict[k]]).toEqual([k, 'string']);
        expect([k, holders(dict[k])]).toEqual([k, holders(en[k])]);
      }
    }
  });
});
