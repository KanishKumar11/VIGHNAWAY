import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { useLiveStore } from '@/stores/live';
import { useTripStore } from '@/stores/trip';
import { useDemoTripController } from '@/hooks/useDemoTrip';
import { makeIncident, scenarioEvent } from './helpers';

const SID = andheriScenario.id;
const point = scenarioEvent(andheriScenario, 'ev02-knee').report.point;
const flood = (over: Partial<Incident>): Incident => makeIncident({ id: 'f', type: 'flood', point, ...over });

function Controller() {
  useDemoTripController();
  return null;
}

afterEach(cleanup);

describe('demo trip controller', () => {
  it('keeps the vehicle and the route change when an incident arrives before the clock catches up', () => {
    useTripStore.setState({ trip: null });
    useLiveStore.setState({ optimistic: {}, confirmed: {}, pulses: {}, ticker: [] });
    useLiveStore.getState().applyReset({ scenarioId: SID, runId: 'x', seq: 0 });
    useLiveStore.getState().applySnapshot({ scenarioId: SID, seq: 0, full: true, runId: 'run-1', simTimeS: 0, incidents: [] });
    render(<Controller />);
    expect(useTripStore.getState().trip?.mode).toBe('local');

    act(() => {
      useLiveStore.getState().applyUpserted({ scenarioId: SID, seq: 1, summary: 'ankle', incident: flood({ seq: 1, depth: 'ankle', lastReportAtS: 60, updatedAtS: 60 }) });
      useLiveStore.getState().setSimTime(60);
    });
    // The server sends incident.upserted (t = 180 s) before sim.state moves the clock to 180 s.
    act(() => {
      useLiveStore.getState().applyUpserted({
        scenarioId: SID,
        seq: 2,
        summary: 'corroborated',
        incident: flood({ seq: 2, depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 180, updatedAtS: 180 }),
      });
    });
    const trip = useTripStore.getState().trip!;
    expect(trip.mode).toBe('local');
    expect(trip.change).not.toBeNull();
    expect(useLiveStore.getState().ticker.some((t) => t.key.includes('change'))).toBe(true);

    act(() => useLiveStore.getState().setSimTime(180));
    expect(useTripStore.getState().trip!.change?.id).toBe(trip.change!.id);
    expect(useTripStore.getState().trip!.mode).toBe('local');
  });
});
