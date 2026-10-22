import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryEntry, Incident } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import { flowDurationMs } from '@vighnaway/engine';
import { andheriScenario } from '@vighnaway/scenario-data';
import { currentLang, LANGS, setCurrentLang, t, TABLES } from '@/i18n';
import { en } from '@/i18n/en';
import { api, ApiError } from '@/lib/api';
import { recommendedRoute, type TripEnv } from '@/lib/demoTrip';
import { replayMoments, replayTrip, seqAtTime } from '@/lib/replay';
import { flowRuns, flowState } from '@/lib/scene';
import { graphFor } from '@/lib/scenario';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { presenterKey } from '@/stores/prefs';
import { isReplaying, useReplay } from '@/stores/replay';
import { useIncidentAction } from '@/hooks/useOperatorActions';
import { IncidentQueue } from '@/components/console/IncidentQueue';
import { whatToDoNow } from '@/components/console/DemoTripPanel';
import { scrubTarget } from '@/components/console/Timeline';
import { makeIncident, scenarioEvent } from './helpers';

const env: TripEnv = { graph: graphFor(andheriScenario.demoTrip.profile), scenario: andheriScenario };
const SID = andheriScenario.id;
const subway = scenarioEvent(andheriScenario, 'ev01-ankle').report.point;

/** The run's history as the API records it: the ankle report at 60 s, corroborated knee at 180 s. */
function history(): HistoryEntry[] {
  const ankle = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'ankle', point: subway, createdAtS: 60, lastReportAtS: 60, updatedAtS: 60, seq: 1 });
  const knee: Incident = { ...ankle, depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 180, updatedAtS: 180, seq: 2 };
  return [
    { seq: 1, atS: 60, kind: 'created', summary: 'Flooding reported', incident: ankle },
    { seq: 2, atS: 180, kind: 'corroborated', summary: 'Second device', incident: knee },
  ];
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setCurrentLang('en');
  useReplay.setState({ atS: null, entries: null, runId: null });
});

describe('decision replay', () => {
  it('finds the last history entry at a moment', () => {
    const h = history();
    expect(seqAtTime(h, 0)).toBe(0);
    expect(seqAtTime(h, 60)).toBe(1);
    expect(seqAtTime(h, 179)).toBe(1);
    expect(seqAtTime(h, 400)).toBe(2);
    expect(replayMoments(h).map((m) => m.atS)).toEqual([60, 180]);
  });

  it('rebuilds the decision at any past moment with the same engine steps as live', () => {
    const h = history();
    const before = replayTrip(env, h, 120);
    expect(before.seq).toBe(1);
    expect(before.incidents.map((i) => i.depth)).toEqual(['ankle']);
    expect(recommendedRoute(before.trip.plan)?.name).toBe('Via Andheri Subway');
    expect(before.trip.change).toBeNull();

    const after = replayTrip(env, h, 200);
    expect(after.seq).toBe(2);
    expect(after.incidents[0]!.status).toBe('corroborated');
    expect(recommendedRoute(after.trip.plan)?.name).toBe('Via Gokhale Bridge');
    expect(after.trip.change?.fromRouteName).toBe('Via Andheri Subway');
    expect(after.trip.change?.triggerIncidentId).toBe('inc-flood');
    // Deterministic: the same moment gives the same plan.
    expect(replayTrip(env, h, 200).trip.plan.recommendedRouteId).toBe(after.trip.plan.recommendedRouteId);
  });

  it('scrubbing clamps to what has happened and snaps back to live near the end', () => {
    const span = { startS: 0, endS: 600 };
    expect(scrubTarget(0.25, span, 400)).toBe(150);
    expect(scrubTarget(0.64, span, 400)).toBe(384);
    expect(scrubTarget(0.9, span, 400)).toBeNull();
    expect(scrubTarget(-1, span, 400)).toBe(0);
    expect(scrubTarget(0.665, span, 400)).toBeNull();
  });

  it('never sends operator actions while replaying', async () => {
    const spy = vi.spyOn(api, 'incidentAction');
    useReplay.getState().seek(120);
    expect(isReplaying()).toBe(true);
    let mutate!: ReturnType<typeof useIncidentAction>['mutateAsync'];
    function Probe() {
      mutate = useIncidentAction().mutateAsync;
      return null;
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>
        <Probe />
      </QueryClientProvider>,
    );
    const inc = history()[1]!.incident;
    await expect(mutate({ incident: inc, action: 'verify' })).rejects.toBeInstanceOf(ApiError);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('speed along the route (static encoding)', () => {
  it('classifies segments and groups runs, with no duration for blocked ones', () => {
    expect(flowState({ slowdown: 1, blocked: false })).toBe('free');
    expect(flowState({ slowdown: 1.6, blocked: false })).toBe('slow');
    expect(flowState({ slowdown: 3, blocked: false })).toBe('jam');
    expect(flowState({ slowdown: Infinity, blocked: true })).toBe('blocked');
    const runs = flowRuns([
      { edgeId: 'a', speedKmh: 30, slowdown: 1, blocked: false },
      { edgeId: 'b', speedKmh: 30, slowdown: 1, blocked: false },
      { edgeId: 'c', speedKmh: 10, slowdown: 3, blocked: false },
      { edgeId: 'd', speedKmh: 0, slowdown: Infinity, blocked: true },
    ]);
    expect(runs.map((r) => [r.state, r.edgeIds.join('')])).toEqual([
      ['free', 'ab'],
      ['jam', 'c'],
      ['blocked', 'd'],
    ]);
    expect(runs[2]!.durationMs).toBeNull();
    // Slower traffic, longer dash travel time.
    expect(flowDurationMs({ speedKmh: 10, blocked: false })!).toBeGreaterThan(flowDurationMs({ speedKmh: 30, blocked: false })!);
  });
});

describe('presenter mode', () => {
  it('P toggles and Escape leaves; ignored while typing or with modifiers', () => {
    expect(presenterKey({ key: 'p' }, false)).toBe(true);
    expect(presenterKey({ key: 'P' }, true)).toBe(false);
    expect(presenterKey({ key: 'Escape' }, true)).toBe(false);
    expect(presenterKey({ key: 'Escape' }, false)).toBeNull();
    expect(presenterKey({ key: 'p', ctrlKey: true }, false)).toBeNull();
    const input = document.createElement('input');
    expect(presenterKey({ key: 'p', target: input }, false)).toBeNull();
  });

  it('the queue shows no operator actions when read-only (replay and presenter)', () => {
    const inc = history()[1]!.incident;
    useLiveStore.setState({ optimistic: {}, confirmed: {}, pulses: {}, ticker: [] });
    useLiveStore.getState().applySnapshot({ scenarioId: SID, seq: 1, full: true, runId: 'run-1', simTimeS: 300, incidents: [inc] });
    useOperator.setState({ token: 'dev-token', dialogOpen: false });
    const wrap = (readOnly: boolean) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <IncidentQueue selectedId={null} onSelect={() => {}} readOnly={readOnly} />
        </QueryClientProvider>,
      );
    wrap(false);
    expect(screen.getAllByRole('button', { name: 'Verify' }).length).toBe(1);
    cleanup();
    wrap(true);
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });
});

/** Every string in a table, calling templates with sample arguments. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') {
    const fn = v as (...a: unknown[]) => unknown;
    const inc = history()[1]!.incident;
    const tries = [Array.from({ length: fn.length }, (_, i) => (i % 2 === 0 ? 'Sample' : 2)), Array.from({ length: fn.length }, () => 2), [inc]];
    for (const args of tries) {
      try {
        const out = fn(...args);
        if (typeof out === 'string') return [out];
      } catch {
        /* try the next shape */
      }
    }
    return [];
  }
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

/** Flattened key paths, so every table can be compared with English. */
function keys(v: unknown, prefix = ''): string[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [prefix];
  return Object.entries(v).flatMap(([k, x]) => keys(x, prefix ? `${prefix}.${k}` : k));
}

describe('languages', () => {
  beforeEach(() => setCurrentLang('en'));

  it('switching the language switches every string read through t', () => {
    expect(t.queue.title).toBe('Incident queue');
    setCurrentLang('hi');
    expect(currentLang()).toBe('hi');
    expect(t.queue.title).toBe('घटना सूची');
    setCurrentLang('mr');
    expect(t.queue.title).toBe('घटनांची यादी');
    setCurrentLang('en');
    expect(t.queue.title).toBe('Incident queue');
  });

  it('every table has exactly the English keys', () => {
    const base = keys(en).sort();
    for (const l of LANGS) expect(keys(TABLES[l]).sort()).toEqual(base);
  });

  it('Hindi and Marathi keep the evidence rules: Corroborated is never "confirmed", Simulated is labelled', () => {
    const inc = history()[1]!.incident;
    expect(TABLES.hi.evidence.status(inc)).toBe('समर्थित (2 डिवाइस)');
    expect(TABLES.mr.evidence.status(inc)).toBe('दुजोरा मिळालेले (2 उपकरणे)');
    expect(TABLES.hi.evidence.source(inc)).toBe('सिम्युलेटेड');
    expect(TABLES.mr.evidence.source(inc)).toBe('सिम्युलेटेड');
    for (const l of ['hi', 'mr'] as const) {
      const status = TABLES[l].evidence.status(inc);
      // पुष्टि / पुष्टी: "confirmed".
      expect(status).not.toMatch(/पुष्ट/);
    }
  });

  it('"सुरक्षित" (safe) appears only in the turn-back sentence, and no table makes a safety promise', () => {
    for (const l of ['hi', 'mr'] as const) {
      const table = TABLES[l];
      const all = strings(table);
      const safe = all.filter((s) => s.includes('सुरक्षित'));
      expect(safe).toEqual([table.decision.reversal]);
      expect(all.filter((s) => /गारंटी|(^|\s)हमी|सबसे सुरक्षित|सर्वात सुरक्षित/.test(s))).toEqual([]);
      expect(all.filter((s) => findForbiddenWords(s).length > 0)).toEqual([]);
      expect(all.filter((s) => s.includes('!'))).toEqual([]);
      expect(all.join(' ')).toContain('112');
    }
    // English uses the engine's sentence for the same moment.
    expect(en.decision.reversal).toBe('Turn back only where it is safe to do so');
  });

  it('"What to do now" is the engine sentence in English and a translated sentence in Hindi', () => {
    const replay = replayTrip(env, history(), 200);
    expect(whatToDoNow(replay.trip.plan, 'Kokilaben Dhirubhai Ambani Hospital')).toMatch(/^Take Gokhale Bridge to Kokilaben Dhirubhai Ambani Hospital, \d+ min\.$/);
    setCurrentLang('hi');
    expect(whatToDoNow(replay.trip.plan, 'Kokilaben Dhirubhai Ambani Hospital')).toMatch(/^Gokhale Bridge से Kokilaben Dhirubhai Ambani Hospital जाएँ, \d+ मिनट।$/);
  });
});
