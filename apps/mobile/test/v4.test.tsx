import { render, screen } from '@testing-library/react-native';
import type { Incident } from '@vighnaway/contracts';
import { buildIncidentIndex, flowDurationMs, planTrip, routeFlow } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { DriveScreen } from '@/features/drive/DriveScreen';
import { roadsAhead } from '@/features/drive/roads';
import { flowRuns } from '@/features/navigate/mapModel';
import { enterFixture, fixtureIncident, leaveFixture } from '@/fixtures/hero';
import { en, t } from '@/i18n/en';
import { REVERSAL_EN, routeLabel, speechFor, statusText, whatToDoNow } from '@/i18n/engineText';
import { fmtDuration } from '@/i18n/format';
import { hi } from '@/i18n/hi';
import { getLanguage, setLanguage } from '@/i18n/lang';
import { mr } from '@/i18n/mr';
import { evalContext, getGraph } from '@/lib/engine';
import { resetSpeechCache, setDriveOpen, speakChange } from '@/lib/speech';
import { useSettings } from '@/stores/settings';
import { recommendedRoute, useTrip } from '@/stores/trip';

const gokhale = { name: 'Via Gokhale Bridge', nameText: { key: 'route.via', params: { road: 'Gokhale Bridge' } } };
const mockSpeak = jest.fn();
const mockVoices = jest.fn(async () => [{ language: 'en-IN' }] as { language: string }[]);
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: jest.fn(),
  getAvailableVoicesAsync: () => mockVoices(),
}));

function initialPlan(incidents: Incident[] = []) {
  const origin = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
  const dest = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
  return planTrip({
    graph: getGraph(andheriGraph, 'car'),
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents,
    nowS: 0,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: dest.id,
  });
}

afterEach(() => {
  setLanguage('en');
});

describe('speed along a route is encoded statically (flow durations)', () => {
  it('slower segments get longer, clamped durations; blocked segments none', () => {
    expect(flowDurationMs({ speedKmh: 30, blocked: false }, 1600)).toBe(1600);
    expect(flowDurationMs({ speedKmh: 10, blocked: false }, 1600)).toBe(4800);
    expect(flowDurationMs({ speedKmh: 1, blocked: false }, 1600)).toBe(1600 * 6);
    expect(flowDurationMs({ speedKmh: 120, blocked: false }, 1600)).toBe(800);
    expect(flowDurationMs({ speedKmh: 30, blocked: true }, 1600)).toBeNull();
  });

  it('a blocked edge interrupts the drawn route into separate runs', () => {
    const graph = getGraph(andheriGraph, 'car');
    const rec = recommendedRoute(initialPlan())!;
    const knee = fixtureIncident('ev02-knee', 'verified', 2, { reportCount: 2 });
    const index = buildIncidentIndex([knee]);
    const ctx = evalContext(andheriScenario, 600);
    const flow = routeFlow(graph, rec.edgeIds, index, ctx);
    expect(flow.some((s) => s.blocked)).toBe(true);
    const { runs } = flowRuns(graph, rec.edgeIds, index, ctx);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const clear = flowRuns(graph, rec.edgeIds, buildIncidentIndex([]), ctx);
    expect(clear.runs).toHaveLength(1);
    // Interrupted: never more points than the clear route. (On the real OSM graph a blocked edge is
    // often a short stretch whose end points the neighbouring runs still draw, so equal is possible.)
    const count = (r: { runs: unknown[][] }) => r.runs.reduce((n, run) => n + run.length, 0);
    expect(count({ runs })).toBeLessThanOrEqual(count(clear));
  });

  it('a congested segment is drawn as a slow run, without motion', () => {
    const graph = getGraph(andheriGraph, 'car');
    const heavy = fixtureIncident('ev04-congestion-a', 'corroborated', 2, { reportCount: 2 });
    const index = buildIncidentIndex([heavy]);
    const ctx = evalContext(andheriScenario, 600);
    const edgeIds = heavy.edgeIds.filter((id) => graph.edgeIndex.has(id)).slice(0, 1);
    const { runs, slow } = flowRuns(graph, edgeIds, index, ctx);
    expect(runs).toHaveLength(1);
    expect(slow).toHaveLength(1);
    expect(flowRuns(graph, edgeIds, buildIncidentIndex([]), ctx).slow).toHaveLength(0);
  });
});

describe('Drive mode', () => {
  beforeEach(() => {
    useTrip.getState().resetTrip();
  });

  it('shows the ETA, the road ahead, what to do now and a clear exit', async () => {
    const plan = initialPlan();
    const rec = recommendedRoute(plan)!;
    useTrip.getState().setPlan(plan, 'car|test');
    await render(<DriveScreen />);
    expect(screen.getByTestId('drive-mode')).toBeTruthy();
    expect(screen.getByTestId('drive-eta')).toHaveTextContent(fmtDuration(rec.etaS + plan.leadInS));
    const dest = andheriScenario.places.find((p) => p.id === useTrip.getState().destinationId)!;
    expect(screen.getByTestId('drive-what-to-do')).toHaveTextContent(whatToDoNow(plan, dest.name));
    expect(screen.getByText('What to do now')).toBeTruthy();
    expect(screen.getByTestId('drive-current-road')).toBeTruthy();
    expect(screen.getByLabelText('Exit Drive mode')).toBeTruthy();
    expect(screen.getByText('Start trip')).toBeTruthy();
    // The simulated designation stays visible here too.
    expect(screen.getByText('Simulated')).toBeTruthy();
  });

  it('names the current road and the next differently named road', () => {
    const graph = getGraph(andheriGraph, 'car');
    const rec = recommendedRoute(initialPlan())!;
    const { current, next } = roadsAhead(graph, rec.edgeIds);
    expect(current).toBeTruthy();
    expect(next).not.toBe(current);
  });
});

describe('language switch', () => {
  it('t(), formatters and engine text follow the selected language, with English kept for English', () => {
    expect(t('startTrip')).toBe(en.startTrip);
    expect(routeLabel(gokhale)).toBe('Via Gokhale Bridge');
    useSettings.getState().setLanguage('hi');
    expect(getLanguage()).toBe('hi');
    expect(t('startTrip')).toBe(hi.startTrip);
    expect(t('startTrip')).not.toBe(en.startTrip);
    expect(fmtDuration(600)).toBe(hi.fmtMin.replace('{n}', '10'));
    expect(routeLabel(gokhale)).toBe(hi.viaRoad.replace('{road}', 'Gokhale Bridge'));
    const corroborated = fixtureIncident('ev01-ankle', 'corroborated', 2);
    expect(statusText(corroborated)).toBe(hi.statusCorroborated.replace('{n}', '2'));
    useSettings.getState().setLanguage('mr');
    expect(t('startTrip')).toBe(mr.startTrip);
    expect(statusText(corroborated)).toBe(mr.statusCorroborated.replace('{n}', '2'));
    useSettings.getState().setLanguage('en');
    expect(statusText(corroborated)).toBe('Corroborated (2 devices)');
  });

  it('what to do now names the same road in every language', () => {
    const plan = initialPlan();
    const road = recommendedRoute(plan)!.name.replace(/^Via /, '');
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setLanguage(lang);
      expect(whatToDoNow(plan, 'Kokilaben Hospital')).toContain(road);
      expect(whatToDoNow(plan, 'Kokilaben Hospital')).toContain('Kokilaben Hospital');
    }
  });
});

describe('spoken route changes', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
  beforeEach(() => {
    mockSpeak.mockClear();
    mockVoices.mockClear();
    resetSpeechCache();
    useSettings.getState().setSpeakChanges(true);
  });
  afterEach(() => {
    setDriveOpen(false);
    leaveFixture();
  });

  function changePlan() {
    enterFixture('change');
    const plan = useTrip.getState().plan!;
    expect(plan.change).toBeTruthy();
    return plan;
  }

  it('builds calm speech text without symbols, from the engine in English', () => {
    const plan = changePlan();
    const s = speechFor(plan)!;
    expect(s.text).toBe(s.englishFallback);
    expect(s.text).toMatch(/^Route changed/);
    expect(s.text).not.toMatch(/[():]/);
    expect(s.text).toMatch(/minutes/);
  });

  it('speaks during a trip when the setting is on, and stays quiet when it is off', async () => {
    const plan = changePlan();
    mockSpeak.mockClear();
    expect(useTrip.getState().mode).toBe('en_route');
    const spoken = await speakChange(speechFor(plan));
    expect(spoken?.language).toBe('en-IN');
    expect(mockSpeak).toHaveBeenCalledWith(spoken!.text, expect.objectContaining({ language: 'en-IN' }));
    mockSpeak.mockClear();
    useSettings.getState().setSpeakChanges(false);
    expect(await speakChange(speechFor(plan))).toBeNull();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('does not speak while planning, unless Drive mode is open', async () => {
    const plan = changePlan();
    useTrip.getState().endTrip();
    mockSpeak.mockClear();
    expect(await speakChange(speechFor(plan))).toBeNull();
    setDriveOpen(true);
    expect(await speakChange(speechFor(plan))).not.toBeNull();
  });

  it('speaks Hindi when the phone has a Hindi voice, and the English sentence otherwise', async () => {
    const plan = changePlan();
    setLanguage('hi');
    mockVoices.mockResolvedValueOnce([{ language: 'hi-IN' }]);
    const local = await speakChange(speechFor(plan));
    expect(local?.language).toBe('hi-IN');
    expect(local?.text).toMatch(/[ऀ-ॿ]/);
    resetSpeechCache();
    mockVoices.mockResolvedValueOnce([{ language: 'en-US' }]);
    const fallback = await speakChange(speechFor(plan));
    expect(fallback?.language).toBe('en-IN');
    expect(fallback?.text).toMatch(/^Route changed/);
  });
});

describe('Hindi and Marathi copy', () => {
  const entries = (d: Record<string, unknown>): [string, string][] =>
    Object.entries(d).flatMap(([k, v]): [string, string][] => (Array.isArray(v) ? v.map((x, i): [string, string] => [`${k}[${i}]`, String(x)]) : [[k, String(v)]]));

  it.each([
    ['hi', hi],
    ['mr', mr],
  ] as const)('%s has exactly the English keys and placeholders', (_lang, dict) => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(en)) {
      if (typeof v !== 'string') continue;
      const ph = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
      expect([k, ph((dict as unknown as Record<string, string>)[k]!)]).toEqual([k, ph(v)]);
    }
  });

  it.each([
    ['hi', hi],
    ['mr', mr],
  ] as const)('%s says सुरक्षित ("safe") only in the mandated reversal sentence, and never guarantees or gives a safety percentage', (_lang, dict) => {
    const withSafe = entries(dict).filter(([, v]) => v.includes('सुरक्षित')).map(([k]) => k);
    expect(withSafe).toEqual(['reversalSentence']);
    expect(en.reversalSentence).toBe(REVERSAL_EN);
    for (const [k, v] of entries(dict)) {
      expect([k, /गारंटी|गॅरंटी|(^|[\s(])हमी|पक्का सुरक्षित|सबसे सुरक्षित|सर्वात सुरक्षित/.test(v)]).toEqual([k, false]);
      expect([k, v.includes('%')]).toEqual([k, false]);
      expect([k, v.includes('!')]).toEqual([k, false]);
    }
  });

  it.each([
    ['hi', hi],
    ['mr', mr],
  ] as const)('%s keeps the simulated label and the 112 number', (_lang, dict) => {
    for (const k of ['firstRunBadge', 'shareHeader', 'notificationTitle', 'shareFooter'] as const) expect(dict[k]).toContain(dict.simulated);
    expect(dict.emergencyFooter).toContain('112');
    expect(dict.driveCall).toContain('112');
    expect(dict.translationNote.length).toBeGreaterThan(0);
  });
});
