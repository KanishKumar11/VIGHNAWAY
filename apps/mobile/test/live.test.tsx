import { render, screen } from '@testing-library/react-native';
import { findForbiddenWords } from '@vighnaway/contracts';
import { andheriGraph, andheriLiveScenario, andheriScenario } from '@vighnaway/scenario-data';
import { ModeBadge } from '@/components/EvidenceChips';
import { switchDataMode } from '@/features/live/mode';
import { statusPill, type StatusInput } from '@/features/navigate/statusModel';
import { getGraph } from '@/lib/engine';
import { buildShareText } from '@/lib/share';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { recommendedRoute, useTrip } from '@/stores/trip';
import { runPlanNow } from '@/features/trip/planner';
import { incident, response } from './helpers';

const base: StatusInput = {
  mode: 'live',
  apiUrl: 'http://192.168.1.10:3000',
  cachedAtSimS: null,
  cachedAtWallMs: null,
  clockStartsAt: andheriLiveScenario.clockStartsAt,
  localClock: false,
  fixture: false,
  nowWallMs: 0,
  mapUnavailable: false,
};
const feed = { availability: 'available' as const, enabled: true, provider: 'TomTom', updatedAgoS: 120, reason: null };

describe('live mode status pill', () => {
  it('shows the live traffic feed and its age when healthy', () => {
    const p = statusPill({ ...base, live: { scenarioMissing: false, feed } });
    expect(p).toMatchObject({ kind: 'feed', tone: 'ok', short: 'Traffic' });
    expect(p.notices[0]!.text).toBe('TomTom live traffic · updated 2 min ago');
  });

  it('says "Live traffic off" with the server reason, and handles a missing feed or scenario', () => {
    const off = statusPill({ ...base, live: { scenarioMissing: false, feed: { ...feed, enabled: false, reason: 'TOMTOM_API_KEY not set' } } });
    expect(off).toMatchObject({ kind: 'feedOff', tone: 'neutral', short: 'Traffic off' });
    expect(off.notices[0]).toMatchObject({ text: 'Live traffic off', sub: 'TOMTOM_API_KEY not set' });
    const missingFeed = statusPill({ ...base, live: { scenarioMissing: false, feed: { ...feed, availability: 'unavailable', enabled: false } } });
    expect(missingFeed.notices[0]!.sub).toBe('This server has no live traffic feed yet.');
    const missing = statusPill({ ...base, mode: 'unreachable', live: { scenarioMissing: true, feed } });
    expect(missing.notices.map((n) => n.key)).toEqual(['unreachable', 'liveMissing']);
  });

  it('never shows the local-clock notice in live mode (no simulated vehicle)', () => {
    const p = statusPill({ ...base, localClock: true, live: { scenarioMissing: false, feed } });
    expect(p.notices.map((n) => n.key)).toEqual(['feed']);
  });
});

describe('switching data mode', () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => {
      throw new Error('offline in tests');
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    switchDataMode('simulated');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('moves the scenario, trip places, incidents and labels to live data and back', async () => {
    useIncidents.getState().applyResponse(response(3, [incident('a', 3)], true));
    switchDataMode('live');
    expect(useSettings.getState().dataMode).toBe('live');
    expect(useScenario.getState().scenario.id).toBe(andheriLiveScenario.id);
    expect(useTrip.getState().destinationId).toBe(andheriLiveScenario.demoTrip.destinationId);
    expect(Object.keys(useIncidents.getState().byId)).toEqual([]);
    // The engine plans on the live places.
    runPlanNow();
    expect(recommendedRoute(useTrip.getState().plan)).toBeTruthy();

    await render(<ModeBadge />);
    expect(screen.getByText('Live data')).toBeTruthy();
    expect(screen.queryByText('Simulated')).toBeNull();

    switchDataMode('simulated');
    expect(useScenario.getState().scenario.id).toBe(andheriScenario.id);
    expect(useTrip.getState().destinationId).toBe(andheriScenario.demoTrip.destinationId);
  });

  it('labels shared text as live data in live mode, with no simulated wording', () => {
    switchDataMode('live');
    runPlanNow();
    const plan = useTrip.getState().plan!;
    const text = buildShareText({
      plan,
      route: recommendedRoute(plan)!,
      placeName: 'Kokilaben Dhirubhai Ambani Hospital',
      graph: getGraph(andheriGraph, 'car'),
      incidents: {},
      clockStartsAt: andheriLiveScenario.clockStartsAt,
      etaS: 900,
      live: true,
    });
    expect(text.split('\n')[0]).toBe('VIGHNAWAY route (Live data: Andheri, Mumbai)');
    expect(text).not.toMatch(/simulat/i);
    expect(findForbiddenWords(text)).toEqual([]);
    switchDataMode('simulated');
  });
});

describe('pending offline reports', () => {
  it('flush each report only to the scenario it was made in', async () => {
    const { usePendingReports } = require('@/stores/reports') as typeof import('@/stores/reports');
    const { flushPendingReports } = require('@/features/live/liveSync') as typeof import('@/features/live/liveSync');
    const urls: string[] = [];
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const input = { type: 'flood' as const, point: { lat: 19.11, lng: 72.84 }, observedPersonally: true, deviceId: 'vw-test-device-01' };
    usePendingReports.getState().enqueue({ localId: 'a', scenarioId: andheriScenario.id, input, createdAtWallMs: 0, activityId: null });
    usePendingReports.getState().enqueue({ localId: 'b', scenarioId: andheriLiveScenario.id, input, createdAtWallMs: 0, activityId: null });
    await flushPendingReports();
    global.fetch = realFetch;
    expect(urls.map((u) => u.replace(/^.*\/scenarios\//, ''))).toEqual([`${andheriScenario.id}/reports`, `${andheriLiveScenario.id}/reports`]);
  });
});
