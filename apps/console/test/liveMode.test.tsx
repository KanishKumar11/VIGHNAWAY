import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeedStatus, Incident } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { feedLine } from '@/hooks/useFeedStatus';
import { isLiveScenario, LIVE_SCENARIO, SCENARIO, scenarioFor } from '@/lib/scenario';
import { scenarioIdFromSearch } from '@/stores/scenario';
import { createLiveStore } from '@/stores/live';
import { EvidenceChips } from '@/components/shared/EvidenceChips';
import { makeIncident, scenarioEvent } from './helpers';

afterEach(cleanup);

const status = (over: Partial<FeedStatus>): FeedStatus => ({
  scenarioId: LIVE_SCENARIO.id,
  provider: 'tomtom',
  enabled: true,
  reason: null,
  pollIntervalS: 120,
  lastPollAtS: 1000,
  lastSuccessAtS: 1000,
  lastError: null,
  activeIncidents: 2,
  attribution: 'Traffic incidents © TomTom',
  ...over,
});

describe('scenario selection', () => {
  it('reads the scenario from the URL and falls back to the simulated demo', () => {
    expect(scenarioIdFromSearch('?scenario=andheri-live')).toBe(LIVE_SCENARIO.id);
    expect(scenarioIdFromSearch('?scenario=nope')).toBe(SCENARIO.id);
    expect(scenarioIdFromSearch('')).toBe(SCENARIO.id);
    expect(isLiveScenario(scenarioFor('andheri-live'))).toBe(true);
    expect(isLiveScenario(scenarioFor(null))).toBe(false);
  });

  it('starts the live store over when the scenario changes', () => {
    const store = createLiveStore(SCENARIO.id);
    store.getState().applySnapshot({ scenarioId: SCENARIO.id, seq: 1, full: true, runId: 'r', simTimeS: 60, incidents: [] });
    store.getState().addTicker({ key: 'k', atS: 1, text: 't' });
    const before = store.getState().resetCount;
    store.getState().switchScenario(LIVE_SCENARIO.id);
    const s = store.getState();
    expect(s.sync.scenarioId).toBe(LIVE_SCENARIO.id);
    expect(s.sync.runId).toBeNull();
    expect(s.ticker).toEqual([]);
    expect(s.resetCount).toBe(before + 1);
  });
});

describe('live traffic feed status', () => {
  it('says when it last updated', () => {
    expect(feedLine(status({}), 1120)).toEqual({ tone: 'ok', text: 'TomTom live traffic · updated 2 min ago' });
    expect(feedLine(status({ lastSuccessAtS: null, lastPollAtS: null }), 5).tone).toBe('waiting');
  });

  it('is quiet when the key is missing and plain when the endpoint is unknown', () => {
    expect(feedLine(status({ enabled: false, reason: 'TOMTOM_API_KEY not set' }), 0)).toEqual({ tone: 'off', text: 'Live traffic off: no TomTom key' });
    expect(feedLine(null, 0).tone).toBe('unknown');
  });

  it('reports the last failure only when it is newer than the last success', () => {
    expect(feedLine(status({ lastError: 'HTTP 403', lastPollAtS: 1200 }), 1200).tone).toBe('error');
    expect(feedLine(status({ lastError: 'HTTP 403', lastPollAtS: 1000 }), 1200).tone).toBe('ok');
  });

  it('labels feed incidents with their provider, never as Simulated', () => {
    const point = scenarioEvent(andheriScenario, 'ev04-congestion-a').report.point;
    const inc: Incident = makeIncident({
      id: 'tt',
      type: 'congestion',
      point,
      scenarioId: LIVE_SCENARIO.id,
      source: 'live_feed',
      status: 'corroborated',
      deviceCount: 0,
      feed: { provider: 'tomtom', externalId: 'tt', delayS: 300, magnitude: 3, probability: 'certain', description: null, from: null, to: null, lastSeenAtS: 0 },
    });
    render(<EvidenceChips incident={inc} nowS={120} />);
    expect(screen.getByText('Reported by TomTom live traffic')).toBeTruthy();
    expect(screen.getByText('TomTom live traffic')).toBeTruthy();
    expect(screen.queryByText('Simulated')).toBeNull();
  });
});
