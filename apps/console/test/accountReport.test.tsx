import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import { ReportAccount } from '@/components/account/ReportAccount';
import { AskForm } from '@/components/report/AskForm';
import { useIncidentAction, useSimAction } from '@/hooks/useOperatorActions';
import { setCurrentLang, t, TABLES, type Lang } from '@/i18n';
import { sendReport } from '@/lib/sendReport';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { apiError, resetAuth, signInAs, stubFetch, type Call } from './authHelpers';
import { makeIncident } from './helpers';

const link = { point: { lat: 19.1163, lng: 72.8471 }, road: 'Andheri Subway' };
const receipt = {
  receipt: { reportId: 'r1', scenarioId: 'andheri-monsoon', outcome: 'created_incident', receivedAtS: 5, snappedEdgeId: 'e1', roadName: 'Andheri Subway', distanceToRoadM: 3 },
  incident: null,
};
const isReport = (c: Call) => c.method === 'POST' && /\/scenarios\/[^/]+\/reports$/.test(c.path);

beforeEach(() => resetAuth());
afterEach(() => {
  cleanup();
  useSession.getState().clear();
  vi.unstubAllGlobals();
  setCurrentLang('en');
});

describe('reports and accounts', () => {
  it('sends no Authorization header when nobody is signed in (anonymous reporting is unchanged)', async () => {
    const { calls } = stubFetch((c) => (isReport(c) ? { status: 201, body: receipt } : undefined));
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    await waitFor(() => expect((screen.getByText(t.report.ask.yes) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(t.report.ask.yes));
    expect(await screen.findByText(t.report.ask.thanksYes)).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it('sends the session as a Bearer header when signed in, so the report is linked', async () => {
    signInAs('citizen');
    const { calls } = stubFetch((c) => (isReport(c) ? { status: 201, body: receipt } : undefined));
    render(<AskForm scenarioId="andheri-monsoon" link={link} />);
    await waitFor(() => expect((screen.getByText(t.report.ask.yes) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(t.report.ask.yes));
    expect(await screen.findByText(t.report.ask.thanksYes)).toBeTruthy();
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-citizen');
    // The device id is still sent: corroboration is unchanged.
    expect((calls[0]!.body as { deviceId: string }).deviceId).toMatch(/^web-/);
  });

  it('a stale token never blocks a report: it is dropped and the report is sent anonymously', async () => {
    signInAs('citizen');
    const { calls } = stubFetch((c) => {
      if (!isReport(c)) return undefined;
      return c.headers.authorization ? apiError(401, 'UNAUTHORIZED', 'Session expired') : { status: 201, body: receipt };
    });
    const input = { type: 'flood', depth: null, point: link.point, deviceId: 'web-abcdefgh12', origin: 'web', observedPersonally: false } as never;
    await sendReport('andheri-monsoon', input);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-citizen');
    expect(calls[1]!.headers.authorization).toBeUndefined();
    expect(useSession.getState().token).toBeNull();
  });

  it('other errors still reach the form, and the session is kept', async () => {
    signInAs('citizen');
    stubFetch(() => apiError(422, 'NOT_ON_ROAD', 'Not on a known road'));
    await expect(sendReport('andheri-monsoon', {} as never)).rejects.toMatchObject({ code: 'NOT_ON_ROAD' });
    expect(useSession.getState().token).toBe('tok-citizen');
  });
});

describe('report page account area', () => {
  it('offers an optional sign-in that opens the code form, and never requires it', async () => {
    stubFetch(() => undefined);
    render(<ReportAccount />);
    const open = await screen.findByRole('button', { name: t.reportAccount.prompt });
    expect(screen.getByText(t.reportAccount.optional)).toBeTruthy();
    fireEvent.click(open);
    expect(await screen.findByLabelText(t.account.emailLabel)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.reportAccount.hide }));
    expect(screen.getByRole('button', { name: t.reportAccount.prompt })).toBeTruthy();
  });

  it('shows a quiet thank-you with counts only', async () => {
    signInAs('citizen');
    const { calls } = stubFetch((c) => (c.path === '/me/stats' ? { body: { reports: 3, inVerifiedIncidents: 1 } } : undefined));
    render(<ReportAccount />);
    const line = await screen.findByText(t.reportAccount.stats(3, 1));
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-citizen');
    expect(line.textContent).toMatch(/3 reports/);
    expect(line.textContent).toMatch(/Thank you/);
    // Counts only: no score, rank, points or percentage, and a plain statement that routes are unaffected.
    const shown = screen.getByTestId('my-stats').textContent!;
    expect(shown).not.toMatch(/score|rank|point|trust|reputation|%/i);
    expect(shown).toContain(t.reportAccount.statsNote);
    expect(findForbiddenWords(shown)).toEqual([]);
  });

  it('uses the singular for one report and says nothing about verified incidents when there are none', () => {
    expect(t.reportAccount.stats(1, 0)).toBe('You have sent 1 report. Thank you.');
    expect(t.reportAccount.stats(2, 1)).toContain('1 is part of an incident an operator verified');
  });

  it('refetches the count after a report is sent', async () => {
    signInAs('citizen');
    let reports = 1;
    const { calls } = stubFetch((c) => {
      if (c.path === '/me/stats') return { body: { reports, inVerifiedIncidents: 0 } };
      if (isReport(c)) {
        reports += 1;
        return { status: 201, body: receipt };
      }
      return undefined;
    });
    render(<ReportAccount />);
    await screen.findByText(t.reportAccount.stats(1, 0));
    await sendReport('andheri-monsoon', {} as never);
    await screen.findByText(t.reportAccount.stats(2, 0));
    expect(calls.filter((c) => c.path === '/me/stats')).toHaveLength(2);
  });

  it('shows the account with Sign out, and signing out returns to the optional prompt', async () => {
    signInAs('citizen');
    stubFetch((c) => (c.path === '/me/stats' ? { body: { reports: 0, inVerifiedIncidents: 0 } } : { status: 204 }));
    render(<ReportAccount />);
    expect(await screen.findByText(t.account.signedInAs('citizen@example.org'))).toBeTruthy();
    expect(await screen.findByText(t.reportAccount.statsNone)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.account.signOut}`) }));
    expect(await screen.findByRole('button', { name: t.reportAccount.prompt })).toBeTruthy();
  });

  it('a stale token on /me/stats clears the session instead of showing an error', async () => {
    signInAs('citizen');
    stubFetch(() => apiError(401, 'UNAUTHORIZED', 'Session expired'));
    render(<ReportAccount />);
    expect(await screen.findByRole('button', { name: t.reportAccount.prompt })).toBeTruthy();
    expect(useSession.getState().token).toBeNull();
  });
});

describe('operator actions use the resolved credential', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>{children}</QueryClientProvider>;
  const incident = makeIncident({ id: 'i1', type: 'flood', point: { lat: 19.116357, lng: 72.846569 }, depth: 'knee' });
  const verifyReply = { body: { incident: { ...incident, status: 'verified' } } };

  it('sends the operator session, not the demo token, when both exist', async () => {
    signInAs('operator');
    useOperator.setState({ token: 'demo-token' });
    const { calls } = stubFetch(() => verifyReply);
    const { result } = renderHook(() => useIncidentAction(), { wrapper });
    await act(async () => result.current.mutate({ incident, action: 'verify' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-operator');
  });

  it('falls back to the demo token, which keeps the scripted demo working', async () => {
    useOperator.setState({ token: 'demo-token' });
    const { calls } = stubFetch(() => verifyReply);
    const { result } = renderHook(() => useIncidentAction(), { wrapper });
    await act(async () => result.current.mutate({ incident, action: 'verify' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.headers.authorization).toBe('Bearer demo-token');
  });

  it('sends nothing for a citizen session', async () => {
    signInAs('citizen');
    const { fn } = stubFetch(() => verifyReply);
    const { result } = renderHook(() => useIncidentAction(), { wrapper });
    await act(async () => result.current.mutate({ incident, action: 'verify' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fn).not.toHaveBeenCalled();
  });

  it('forgets a session the server rejects (401) but keeps the demo token dialog for a rejected token', async () => {
    signInAs('operator');
    stubFetch(() => apiError(401, 'UNAUTHORIZED', 'Session expired'));
    const a = renderHook(() => useSimAction(), { wrapper });
    await act(async () => a.result.current.mutate('play'));
    await waitFor(() => expect(a.result.current.isError).toBe(true));
    expect(useSession.getState().token).toBeNull();
    a.unmount();

    resetAuth();
    useOperator.setState({ token: 'old-token', dialogOpen: false });
    const b = renderHook(() => useSimAction(), { wrapper });
    await act(async () => b.result.current.mutate('play'));
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    expect(useOperator.getState().token).toBeNull();
    expect(useOperator.getState().dialogOpen).toBe(true);
  });

  it('a 403 for a session keeps it but re-reads the account (its role may have changed)', async () => {
    signInAs('operator');
    const { calls } = stubFetch((c) => (c.path === '/auth/me' ? { body: { user: { id: 'u-operator', email: 'operator@example.org', role: 'citizen', displayName: null }, client: 'web' } } : apiError(403, 'FORBIDDEN', 'Operators only')));
    const { result } = renderHook(() => useSimAction(), { wrapper });
    await act(async () => result.current.mutate('play'));
    await waitFor(() => expect(useSession.getState().user?.role).toBe('citizen'));
    expect(calls.map((c) => c.path)).toEqual(['/scenarios/andheri-monsoon/sim/play', '/auth/me']);
  });
});

describe('account copy', () => {
  it('every language has the same keys and no forbidden words', () => {
    const shape = (v: unknown): unknown => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
    const sample = (v: unknown): string[] => {
      if (typeof v === 'string') return [v];
      if (typeof v === 'function') {
        const fn = v as (...a: unknown[]) => unknown;
        return [String(fn(...Array.from({ length: fn.length }, (_, i) => (i % 2 === 0 ? 'x@example.org' : 2))))];
      }
      if (v && typeof v === 'object') return Object.values(v).flatMap(sample);
      return [];
    };
    for (const group of ['account', 'gate', 'reportAccount', 'admin'] as const) {
      for (const lang of ['hi', 'mr'] as Lang[]) {
        expect(shape(TABLES[lang][group]), `${lang}.${group}`).toEqual(shape(TABLES.en[group]));
        for (const s of sample(TABLES[lang][group])) {
          expect(findForbiddenWords(s), s).toEqual([]);
          expect(s).toMatch(/[ऀ-ॿ]|\d/);
        }
      }
    }
  });
});
