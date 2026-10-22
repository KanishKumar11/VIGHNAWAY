import { fireEvent, render } from '@testing-library/react-native';
import { act } from 'react';
import { ReportInputSchema } from '@vighnaway/contracts';
import type { PlanResult } from '@vighnaway/contracts';
import { dataGapQuestions, planTrip } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { AskCard } from '@/features/ask/AskCard';
import { reportForAnswer } from '@/features/ask/answer';
import { submitReport } from '@/features/report/submit';
import { setLanguage } from '@/i18n/lang';
import { getGraph } from '@/lib/engine';
import { askKey, useAsked } from '@/stores/ask';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';

jest.mock('@/features/report/submit', () => ({ submitReport: jest.fn(async () => ({ kind: 'sent' })) }));
const mockSubmit = submitReport as jest.Mock;

/** P1-4: ask the crowd at data gaps. The plan is the engine's, with one synthetic data gap on a real route edge. */

const demo = andheriScenario.demoTrip;
const place = (id: string) => andheriScenario.places.find((p) => p.id === id)!;
const graph = getGraph(andheriGraph, 'car');

function planWithGap(): PlanResult {
  const plan = planTrip({
    graph,
    origin: place(demo.originId).nodeId,
    destination: place(demo.destinationId).nodeId,
    incidents: [],
    nowS: 0,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: demo.destinationId,
  });
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId)!;
  const gap = { edgeId: rec.edgeIds[Math.floor(rec.edgeIds.length / 2)]!, roadName: 'Test Road', positionM: 100, penaltyS: 120 };
  return { ...plan, routes: plan.routes.map((r) => (r.routeId === rec.routeId ? { ...r, dataGaps: [gap] } : r)) };
}

beforeEach(() => {
  mockSubmit.mockClear();
  useAsked.setState({ askedAtMs: {} });
  useSettings.getState().setProfile('car');
  useTrip.getState().resetTrip();
});
afterEach(() => setLanguage('en'));

describe('reportForAnswer: an answer is an ordinary report', () => {
  const [q] = dataGapQuestions(planWithGap(), graph);

  it('Yes is a flood report, No is Road clear, Not sure files nothing; both validate and are never personally observed', () => {
    const yes = reportForAnswer(q!, 'yes', 'device-12345678')!;
    const no = reportForAnswer(q!, 'no', 'device-12345678')!;
    expect(yes).toMatchObject({ type: 'flood', depth: null, observedPersonally: false });
    expect(no).toMatchObject({ type: 'road_clear', observedPersonally: false });
    expect(ReportInputSchema.safeParse(yes).success).toBe(true);
    expect(ReportInputSchema.safeParse(no).success).toBe(true);
    expect(reportForAnswer(q!, 'not_sure', 'device-12345678')).toBeNull();
    // No status or verification field exists on a report: only an operator action sets Verified.
    expect(Object.keys(yes)).not.toContain('status');
  });
});

describe('AskCard', () => {
  it('asks about the data-gap road with Yes / No / Not sure', async () => {
    const { getByTestId, getByText } = await render(<AskCard plan={planWithGap()} graph={graph} />);
    expect(getByTestId('ask-question').props.children).toBe('Is Test Road flooded right now?');
    expect(getByText('Yes')).toBeTruthy();
    expect(getByText('No')).toBeTruthy();
    expect(getByText('Not sure')).toBeTruthy();
    expect(getByText(/stays Unverified/)).toBeTruthy();
  });

  it('Yes files a flood report and the road is not asked again for 30 minutes', async () => {
    const plan = planWithGap();
    const { getByTestId, queryByTestId } = await render(<AskCard plan={plan} graph={graph} />);
    await act(async () => {
      await fireEvent.press(getByTestId('ask-yes'));
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0]![0]).toMatchObject({ type: 'flood', observedPersonally: false });
    expect(queryByTestId('ask-card')).toBeNull();
    expect(Object.keys(useAsked.getState().askedAtMs)).toEqual([askKey(andheriScenario.id, 'Test Road')]);
  });

  it('No files a Road clear report; Not sure files nothing but still counts as asked', async () => {
    const plan = planWithGap();
    const no = await render(<AskCard plan={plan} graph={graph} />);
    await act(async () => {
      await fireEvent.press(no.getByTestId('ask-no'));
    });
    expect(mockSubmit.mock.calls[0]![0]).toMatchObject({ type: 'road_clear' });
    await no.unmount();

    useAsked.setState({ askedAtMs: {} });
    mockSubmit.mockClear();
    const unsure = await render(<AskCard plan={plan} graph={graph} />);
    await act(async () => {
      await fireEvent.press(unsure.getByTestId('ask-not-sure'));
    });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(unsure.queryByTestId('ask-card')).toBeNull();
  });

  it('does not ask a road that was asked about less than 30 minutes ago, and asks again after', async () => {
    const plan = planWithGap();
    useAsked.setState({ askedAtMs: { [askKey(andheriScenario.id, 'Test Road')]: Date.now() - 10 * 60 * 1000 } });
    const recent = await render(<AskCard plan={plan} graph={graph} />);
    expect(recent.queryByTestId('ask-card')).toBeNull();
    await recent.unmount();
    useAsked.setState({ askedAtMs: { [askKey(andheriScenario.id, 'Test Road')]: Date.now() - 31 * 60 * 1000 } });
    const later = await render(<AskCard plan={plan} graph={graph} />);
    expect(later.queryByTestId('ask-card')).not.toBeNull();
  });

  it('never asks while the traveller is moving faster than walking pace; on foot it may', async () => {
    useTrip.setState({ mode: 'en_route' });
    const driving = await render(<AskCard plan={planWithGap()} graph={graph} />);
    expect(driving.queryByTestId('ask-card')).toBeNull();
    await driving.unmount();
    useSettings.getState().setProfile('foot');
    const walking = await render(<AskCard plan={planWithGap()} graph={graph} />);
    expect(walking.queryByTestId('ask-card')).not.toBeNull();
  });

  it('asks nothing when the plan has no data gap', async () => {
    const plan = planWithGap();
    const none = { ...plan, routes: plan.routes.map((r) => ({ ...r, dataGaps: [] })) };
    const { queryByTestId } = await render(<AskCard plan={none} graph={graph} />);
    expect(queryByTestId('ask-card')).toBeNull();
  });

  it('reads in Hindi', async () => {
    setLanguage('hi');
    const { getByTestId } = await render(<AskCard plan={planWithGap()} graph={graph} />);
    expect(getByTestId('ask-question').props.children).toMatch(/Test Road/);
    expect(getByTestId('ask-question').props.children).toMatch(/[ऀ-ॿ]/);
  });
});
