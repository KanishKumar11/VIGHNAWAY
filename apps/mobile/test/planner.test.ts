import { findForbiddenWords } from '@vighnaway/contracts';
import { vehiclePosition } from '@vighnaway/engine';
import { andheriGraph } from '@vighnaway/scenario-data';
import { enterFixture, leaveFixture } from '@/fixtures/hero';
import { runPlanNow } from '@/features/trip/planner';
import { getGraph } from '@/lib/engine';
import { buildShareText } from '@/lib/share';
import { useActivity } from '@/stores/activity';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useToast } from '@/stores/toast';
import { recommendedRoute, useTrip } from '@/stores/trip';

describe('route change en route (hero fixture data)', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
  beforeEach(() => {
    useActivity.getState().clear();
    useTrip.getState().resetTrip();
  });
  afterEach(() => leaveFixture());

  it('an unverified ankle-deep report keeps route A and records an unchanged notice', () => {
    enterFixture('peek');
    const trip = useTrip.getState();
    expect(trip.mode).toBe('en_route');
    expect(recommendedRoute(trip.plan)?.name).toBe('Via Andheri Subway');
    expect(trip.banner).toBeNull();
    expect(useActivity.getState().entries.some((e) => e.text === 'Route unchanged: one unverified report')).toBe(true);
  });

  it('a route change withdraws the "Route unchanged" toast and never shows both at once', () => {
    enterFixture('peek');
    expect(useToast.getState().toast?.message).toBe('Route unchanged: one unverified report');
    enterFixture('change');
    expect(useTrip.getState().banner?.title).toBe('Route changed');
    expect(useToast.getState().toast).toBeNull();
    // A later plan with an unchanged notice must not contradict the banner that is still up.
    runPlanNow();
    expect(useToast.getState().toast?.message ?? null).not.toBe('Route unchanged: one unverified report');
  });

  it('a corroborated knee-deep report re-plans from the vehicle onto another crossing and explains why', () => {
    enterFixture('change');
    const trip = useTrip.getState();
    const rec = recommendedRoute(trip.plan)!;
    expect(rec.name).not.toBe('Via Andheri Subway');
    expect(trip.banner?.title).toBe('Route changed');
    expect(trip.banner?.message).toMatch(/^Route changed\. Flooding \(knee deep\) at Andheri Subway: Corroborated \(2 devices\), Simulated\. New route via /);
    expect(findForbiddenWords(trip.banner!.message)).toEqual([]);
    expect(useActivity.getState().entries[0]?.kind).toBe('route_changed');
    // Frozen mid-animation for the hero screen.
    expect(trip.transition).toMatchObject({ phase: 'reveal', progress: 0.5, frozen: true });
    // The vehicle keeps its edge and direction: re-planning starts ahead of it, never behind.
    const graph = getGraph(andheriGraph, 'car');
    const pos = vehiclePosition(graph, trip.vehicle!);
    expect(trip.plan?.vehicle?.edgeId).toBe(pos?.edgeId);
    expect(trip.plan?.isReversal).toBe(false);
    expect(trip.vehicle!.edgeIds.slice(1)).toEqual(rec.edgeIds);
  });

  it('builds plain share text labelled as simulated', () => {
    enterFixture('change');
    const trip = useTrip.getState();
    const rec = recommendedRoute(trip.plan)!;
    const text = buildShareText({
      plan: trip.plan!,
      route: rec,
      placeName: 'Kokilaben Dhirubhai Ambani Hospital',
      graph: getGraph(andheriGraph, 'car'),
      incidents: useIncidents.getState().byId,
      clockStartsAt: useScenario.getState().scenario.clockStartsAt,
      etaS: rec.etaS,
    });
    expect(text).toMatch(/Simulated scenario/);
    expect(text).toMatch(/Hazards avoided: Flooding \(knee deep\) at Andheri Subway: Corroborated \(2 devices\), Simulated/);
    expect(text).toMatch(/Evaluated at 14:0\d \(simulation clock\)/);
    expect(findForbiddenWords(text)).toEqual([]);
    expect(text).not.toMatch(/<[^>]+>/);
  });
});
