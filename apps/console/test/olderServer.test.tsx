import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportInput } from '@vighnaway/contracts';
import { SignInForm } from '@/components/account/SignInForm';
import { setCurrentLang, t } from '@/i18n';
import { ApiError, describeApiError } from '@/lib/api';
import { sendReport } from '@/lib/sendReport';
import { useSession } from '@/stores/session';
import { apiError, resetAuth, stubFetch, type Call } from './authHelpers';

/**
 * The console is often newer than the API it talks to (the API is redeployed separately). These
 * are the two failures that showed: sign-in against an API with no /auth routes, and a web report
 * against an API that does not know the `origin` label.
 */
beforeEach(() => resetAuth());
afterEach(() => {
  cleanup();
  useSession.getState().clear();
  vi.unstubAllGlobals();
  setCurrentLang('en');
});

const input: ReportInput = {
  type: 'flood',
  depth: 'ankle',
  point: { lat: 19.12429, lng: 72.84673 },
  observedPersonally: true,
  deviceId: 'device-test-aaaa',
  origin: 'web',
};
const receipt = {
  receipt: { reportId: 'r1', scenarioId: 'andheri-monsoon', outcome: 'created_incident', receivedAtS: 5, snappedEdgeId: 'e1', roadName: 'Andheri Subway', distanceToRoadM: 3 },
  incident: null,
};
const isReport = (c: Call) => c.method === 'POST' && /\/scenarios\/[^/]+\/reports$/.test(c.path);
const unknownOrigin = apiError(400, 'VALIDATION_FAILED', 'The request is not valid', [
  { path: [], code: 'unrecognized_keys', message: "Unrecognized key(s) in object: 'origin'" },
]);

describe('sign-in against an API without sign-in', () => {
  it('says the server is out of date instead of "Cannot POST /auth/otp/request"', async () => {
    stubFetch((c) => (c.path === '/auth/otp/request' ? apiError(404, 'NOT_FOUND', 'Cannot POST /auth/otp/request') : undefined));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(t.account.emailLabel), { target: { value: 'rider@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: t.account.sendCode }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(t.account.serverOutdated);
    expect(alert.textContent).not.toContain('Cannot POST');
  });

  it('has the message in Hindi and Marathi too', () => {
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      expect(t.account.serverOutdated.length).toBeGreaterThan(20);
      expect(t.account.serverOutdated).not.toBe(
        (setCurrentLang('en'), t.account.serverOutdated),
      );
    }
  });
});

describe('a web report against an API that does not know "origin"', () => {
  it('is sent again without the label, and goes through', async () => {
    const { calls } = stubFetch((c) => {
      if (!isReport(c)) return undefined;
      return 'origin' in (c.body as object) ? unknownOrigin : { status: 201, body: receipt };
    });
    const resp = await sendReport('andheri-monsoon', input);
    expect(resp.receipt.reportId).toBe('r1');
    const reports = calls.filter(isReport);
    expect(reports).toHaveLength(2);
    expect((reports[0]!.body as ReportInput).origin).toBe('web');
    expect('origin' in (reports[1]!.body as object)).toBe(false);
    // Everything else about the report is unchanged.
    expect(reports[1]!.body).toMatchObject({ type: 'flood', depth: 'ankle', deviceId: 'device-test-aaaa' });
  });

  it('does not retry for any other rejection, and says which field was refused', async () => {
    const other = apiError(400, 'VALIDATION_FAILED', 'The request is not valid', [{ path: ['depth'], code: 'custom', message: 'Depth applies to flood reports only' }]);
    const { calls } = stubFetch((c) => (isReport(c) ? other : undefined));
    const err = await sendReport('andheri-monsoon', input).catch((e: unknown) => e);
    expect(calls.filter(isReport)).toHaveLength(1);
    expect(err).toBeInstanceOf(ApiError);
    expect(describeApiError(err)).toBe('The request is not valid (depth: Depth applies to flood reports only)');
  });

  it('does not retry a report that never had a label, and keeps the server message otherwise', async () => {
    const { calls } = stubFetch((c) => (isReport(c) ? unknownOrigin : undefined));
    const bare: ReportInput = { ...input };
    delete bare.origin;
    await expect(sendReport('andheri-monsoon', bare)).rejects.toBeInstanceOf(ApiError);
    expect(calls.filter(isReport)).toHaveLength(1);
    expect(describeApiError(new Error('boom'))).toBe('boom');
    expect(describeApiError(new ApiError('NOT_ON_ROAD', 'Not on a known road', 422))).toBe('Not on a known road');
  });
});
