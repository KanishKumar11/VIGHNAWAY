import { render, screen } from '@testing-library/react-native';
import { decodeRelay, encodeRelay, ReportInputSchema, type ReportInput } from '@vighnaway/contracts';
import { RelayScreen } from '@/features/relay/RelayScreen';
import { submitReport } from '@/features/report/submit';
import { api, ApiRequestError } from '@/lib/api';
import { newClientReportId, qrPath, relayMatrix, stampReport } from '@/lib/relay';
import { useConnection } from '@/stores/connection';
import { usePendingReports, type PendingReport } from '@/stores/reports';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

/** P2-2.b: a report made with no signal carries its own id and shows as a QR code; the QR text is the shared relay payload. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base: ReportInput = ReportInputSchema.parse({
  type: 'flood',
  depth: 'knee',
  point: { lat: 19.12379, lng: 72.85037 },
  observedPersonally: true,
  deviceId: 'vw-0a1b2c3d4e5f6a7b8c9d',
});
const pendingReport = (over: Partial<PendingReport> & { input?: ReportInput } = {}): PendingReport => ({
  localId: 'pending-a',
  scenarioId: useScenario.getState().scenario.id,
  input: stampReport(base),
  createdAtWallMs: 1,
  activityId: null,
  ...over,
});

beforeEach(() => {
  usePendingReports.setState({ pending: [] });
  useSim.setState({ simTimeS: 600 });
  useConnection.setState({ net: 'online' });
  useSettings.setState({ apiUrl: 'http://api.test' });
});

describe('report ids', () => {
  it('makes a valid UUID each time and stamps a report with it and the last known simulation second', () => {
    const a = newClientReportId();
    expect(a).toMatch(UUID);
    expect(newClientReportId()).not.toBe(a);
    const stamped = stampReport(base);
    expect(stamped.clientReportId).toMatch(UUID);
    expect(stamped.observedAtS).toBe(600);
    expect(ReportInputSchema.safeParse(stamped).success).toBe(true);
  });

  it('keeps ids the report already has (a retry sends the same one)', () => {
    const once = stampReport(base);
    expect(stampReport(once)).toEqual(once);
  });
});

describe('the code', () => {
  it('encodes the shared relay payload and draws every dark module exactly once', () => {
    const report = stampReport(base);
    const m = relayMatrix('andheri-monsoon', report);
    expect(m.size).toBeGreaterThanOrEqual(21);
    const dark = Array.from(m.data).filter(Boolean).length;
    const rects = qrPath(m).match(/M\d+ \d+h(\d+)v1h-\d+z/g) ?? [];
    expect(rects.reduce((n, r) => n + Number(/h(\d+)v/.exec(r)![1]), 0)).toBe(dark);
    expect(decodeRelay(encodeRelay('andheri-monsoon', report))).toMatchObject({ ok: true });
  });
});

describe('Show report as a code', () => {
  it('shows a code for each waiting report of this scenario and none for another scenario', async () => {
    usePendingReports.setState({
      pending: [pendingReport(), pendingReport({ localId: 'pending-b', input: stampReport({ ...base, type: 'congestion', congestion: 'heavy', depth: undefined }) }), pendingReport({ localId: 'pending-other', scenarioId: 'andheri-live' })],
    });
    await render(<RelayScreen />);
    expect(screen.getByTestId('relay-qr-pending-a')).toBeTruthy();
    expect(screen.getByTestId('relay-qr-pending-b')).toBeTruthy();
    expect(screen.queryByTestId('relay-qr-pending-other')).toBeNull();
    expect(screen.getAllByText('Pending send')).toHaveLength(2);
  });

  it('says nothing is waiting when the queue is empty', async () => {
    await render(<RelayScreen />);
    expect(screen.getByTestId('relay-empty')).toBeTruthy();
  });

  it('gives a report queued before codes existed its id, so it can be shown too', async () => {
    usePendingReports.setState({ pending: [pendingReport({ input: base })] });
    await render(<RelayScreen />);
    expect(usePendingReports.getState().pending[0]!.input.clientReportId).toMatch(UUID);
    expect(screen.getByTestId('relay-qr-pending-a')).toBeTruthy();
  });
});

describe('sending carries the ids, and an older server does not cost the report', () => {
  const realReport = api.report;
  afterEach(() => {
    api.report = realReport;
  });

  it('a report made offline is queued with its client id, ready to show as a code', async () => {
    useConnection.setState({ net: 'offline' });
    const out = await submitReport(base);
    expect(out.kind).toBe('pending');
    const queued = usePendingReports.getState().pending.at(-1)!;
    expect(queued.input.clientReportId).toMatch(UUID);
    expect(queued.input.observedAtS).toBe(600);
  });

  it('a 400 from a server that does not know the new fields is retried once without them', async () => {
    const bodies: unknown[] = [];
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.clientReportId !== undefined) {
        return { ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_FAILED', message: 'Unrecognized key(s)' } }) } as Response;
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ receipt: { reportId: 'r1', scenarioId: 'andheri-monsoon', outcome: 'created_incident', receivedAtS: 600, snappedEdgeId: 'e', roadName: null, distanceToRoadM: 1 }, incident: null }),
      } as Response;
    }) as unknown as typeof fetch;
    const res = await api.report('http://api.test', 'andheri-monsoon', stampReport(base));
    expect(res.receipt.reportId).toBe('r1');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty('clientReportId');
    expect(bodies[1]).not.toHaveProperty('observedAtS');
  });

  it('a 400 that is about something else still surfaces', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_FAILED', message: 'Bad' } }) }) as Response) as unknown as typeof fetch;
    await expect(api.report('http://api.test', 'andheri-monsoon', base)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
