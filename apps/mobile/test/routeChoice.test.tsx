import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { PlanResult } from '@vighnaway/contracts';
import { cameraCalls, recorded, resetRecorded } from './mocks/react-native-maps';
import { NavigateMap } from '@/features/navigate/NavigateMap';
import { routeLabelsFor, useMapModel } from '@/features/navigate/mapModel';
import { runPlanNow, startTrip } from '@/features/trip/planner';
import { leaveFixture } from '@/fixtures/hero';
import { fmtDuration } from '@/i18n/format';
import { getGraph, routeCoords } from '@/lib/engine';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { activeRoute, recommendedRoute, useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { lineStyle, themes } from '@/theme';

// The camera and route-line tests need the Google map (not the schematic fallback).
jest.mock('@/config/env', () => ({ ...jest.requireActual('@/config/env'), googleMapsConfigured: true }));

function freshPlan(): PlanResult {
  leaveFixture();
  useIncidents.getState().clearCache();
  useScenario.getState().setRegion('andheri');
  useTrip.getState().resetTrip();
  useSettings.getState().setProfile('car');
  const plan = runPlanNow();
  if (!plan) throw new Error('no plan');
  return plan;
}

const graph = () => getGraph(useScenario.getState().graphFile, 'car');
const alternative = (plan: PlanResult) => plan.routes.find((r) => r.role !== 'recommended' && r.role !== 'blocked');

describe('choosing a route', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    leaveFixture();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
  beforeEach(() => resetRecorded());

  it('has more than one route to choose from on the default trip', () => {
    const plan = freshPlan();
    expect(plan.routes.filter((r) => r.role !== 'blocked').length).toBeGreaterThan(1);
  });

  describe('the store', () => {
    it('follows the recommended route until one is chosen, never a blocked or unknown route', () => {
      const plan = freshPlan();
      const alt = alternative(plan)!;
      expect(activeRoute(plan, null)?.routeId).toBe(plan.recommendedRouteId);
      expect(activeRoute(plan, alt.routeId)?.routeId).toBe(alt.routeId);
      expect(activeRoute(plan, 'no-such-route')?.routeId).toBe(plan.recommendedRouteId);
      const blocked = { ...plan, routes: plan.routes.map((r) => (r.routeId === alt.routeId ? { ...r, role: 'blocked' as const } : r)) };
      expect(activeRoute(blocked, alt.routeId)?.routeId).toBe(plan.recommendedRouteId);
    });

    it('keeps the choice across a re-plan of the same trip, and drops it for a new trip', () => {
      const plan = freshPlan();
      const alt = alternative(plan)!;
      useTrip.getState().selectRoute(alt.routeId);
      runPlanNow();
      expect(useTrip.getState().selectedRouteId).toBe(alt.routeId);
      useTrip.getState().setPlan(plan, 'another|trip|context');
      expect(useTrip.getState().selectedRouteId).toBeNull();
    });

    it('starts the trip along the chosen route, not the recommended one', () => {
      const plan = freshPlan();
      const alt = alternative(plan)!;
      useTrip.getState().selectRoute(alt.routeId);
      startTrip();
      const trip = useTrip.getState();
      expect(trip.mode).toBe('en_route');
      expect(trip.vehicle?.edgeIds).toEqual(alt.edgeIds);
      // A running trip has no pending choice.
      expect(trip.selectedRouteId).toBeNull();
      useTrip.getState().endTrip();
    });
  });

  describe('the map', () => {
    const model = (selectedRouteId: string | null) => {
      const trip = useTrip.getState();
      return renderHook(() =>
        useMapModel({ graph: graph(), plan: trip.plan, vehicle: null, transition: null, incidents: [], origin: null, destination: null, nowS: 300, revealProgress: 1, selectedRouteId }),
      );
    };

    it('draws every route as a visible, outlined, tappable line, the alternatives under the main one', async () => {
      const plan = freshPlan();
      const { result } = await model(null);
      const routeLines = result.current.lines.filter((l) => l.routeId);
      expect(routeLines).toHaveLength(plan.routes.length);
      const alt = lineStyle(themes.light, 'alternative');
      expect(alt.width).toBeGreaterThanOrEqual(5);
      expect(alt.casing).toBeTruthy();
      const main = routeLines.find((l) => l.routeId === plan.recommendedRouteId)!;
      expect(main.style).toBe('recommended');
      for (const l of routeLines.filter((x) => x.style === 'alternative')) {
        expect(l.casing).toBe(true);
        expect(l.zIndex).toBeLessThan(main.zIndex);
      }
    });

    it('draws the chosen route as the main one and the recommended route as an alternative', async () => {
      const plan = freshPlan();
      const alt = alternative(plan)!;
      const { result } = await model(alt.routeId);
      const byId = (id: string) => result.current.lines.find((l) => l.routeId === id)!;
      expect(byId(alt.routeId).style).toBe('recommended');
      expect(byId(plan.recommendedRouteId!).style).not.toBe('recommended');
      expect(byId(alt.routeId).zIndex).toBeGreaterThan(byId(plan.recommendedRouteId!).zIndex);
    });

    it('puts a time bubble on the main route and on each alternative with road of its own', async () => {
      const plan = freshPlan();
      const main = recommendedRoute(plan)!;
      const labels = routeLabelsFor(graph(), plan.routes, plan.recommendedRouteId);
      expect(labels[0]).toMatchObject({ primary: true, routeId: main.routeId, text: fmtDuration(main.etaS) });
      for (const l of labels.slice(1)) {
        expect(l.primary).toBe(false);
        expect(l.text).toMatch(/^[+−]\d/);
      }
      expect(labels.length).toBeLessThanOrEqual(4);
      // Choosing an alternative moves the total onto it and shows the other as a difference.
      const alt = alternative(plan)!;
      const flipped = routeLabelsFor(graph(), plan.routes, alt.routeId);
      expect(flipped[0]).toMatchObject({ primary: true, routeId: alt.routeId, text: fmtDuration(alt.etaS) });
    });

    it('gives no bubble to a route that is the same line as the main one', () => {
      const plan = freshPlan();
      const main = recommendedRoute(plan)!;
      const twin = { ...main, routeId: 'twin', role: 'alternative' as const, etaS: main.etaS + 120 };
      const labels = routeLabelsFor(graph(), [main, twin], main.routeId);
      expect(labels.map((l) => l.routeId)).toEqual([main.routeId]);
    });
  });

  describe('tapping and the navigation camera', () => {
    const open = async () => {
      await render(<NavigateMap padding={{ top: 0, left: 0, right: 0, bottom: 0 }} fitPadding={{ top: 0, left: 0, right: 0, bottom: 0 }} dimmed={false} onIncidentPress={jest.fn()} onMapPress={jest.fn()} />);
    };

    it('chooses an alternative when its line is tapped, and goes back when the recommended one is', async () => {
      const plan = freshPlan();
      const alt = alternative(plan)!;
      await open();
      // A route's lines are found by the coordinates of its own geometry.
      const handlersFor = (routeId: string) => {
        const r = plan.routes.find((x) => x.routeId === routeId)!;
        const coords = routeCoords(graph(), r.edgeIds, r.routeId);
        const first = coords[0]!;
        const last = coords[coords.length - 1]!;
        return recorded
          .filter((o) => o.kind === 'polyline' && o.props.tappable === true)
          .filter((o) => {
            const c = o.props.coordinates as { latitude: number; longitude: number }[];
            return c.length === coords.length && c[0]!.latitude === first.latitude && c[c.length - 1]!.longitude === last.longitude;
          })
          .map((o) => o.props.onPress as () => void);
      };
      const altHandlers = handlersFor(alt.routeId);
      expect(altHandlers.length).toBeGreaterThan(0);
      await act(async () => altHandlers.forEach((h) => h()));
      expect(useTrip.getState().selectedRouteId).toBe(alt.routeId);
      const mainHandlers = handlersFor(plan.recommendedRouteId!);
      expect(mainHandlers.length).toBeGreaterThan(0);
      await act(async () => mainHandlers.forEach((h) => h()));
      expect(useTrip.getState().selectedRouteId).toBeNull();
    });

    it('ignores a tap on a route while a trip is running', async () => {
      const plan = freshPlan();
      await open();
      await act(async () => startTrip());
      const handler = recorded.filter((o) => o.kind === 'polyline' && o.props.tappable === true).map((o) => o.props.onPress as () => void)[0]!;
      await act(async () => handler());
      expect(useTrip.getState().selectedRouteId).toBeNull();
      expect(plan.routes.length).toBeGreaterThan(0);
      useTrip.getState().endTrip();
    });

    it('zooms to the vehicle, tilted and turned to its heading, when the trip starts', async () => {
      freshPlan();
      await open();
      const before = cameraCalls.length;
      await act(async () => startTrip());
      const flights = cameraCalls.slice(before).filter((c) => c.camera.pitch === 50);
      expect(flights.length).toBeGreaterThan(0);
      const camera = flights[flights.length - 1]!.camera;
      expect(camera.zoom).toBe(17);
      expect(camera.center).toEqual(expect.objectContaining({ latitude: expect.any(Number), longitude: expect.any(Number) }));
      expect(typeof camera.heading).toBe('number');
      expect(useUi.getState().following).toBe(true);
      useTrip.getState().endTrip();
    });

    it('stops following when the traveller drags the map, and follows again from the re-centre button', async () => {
      freshPlan();
      await open();
      await act(async () => startTrip());
      expect(useUi.getState().following).toBe(true);
      await fireEvent(screen.getByTestId('map-view'), 'panDrag');
      expect(useUi.getState().following).toBe(false);
      const before = cameraCalls.length;
      await act(async () => useUi.getState().setFollowing(true));
      expect(cameraCalls.length).toBeGreaterThan(before);
      useTrip.getState().endTrip();
    });

    it('flattens the camera and shows the whole route again when the trip ends', async () => {
      freshPlan();
      await open();
      await act(async () => startTrip());
      const before = cameraCalls.length;
      await act(async () => useTrip.getState().endTrip());
      const after = cameraCalls.slice(before);
      expect(after.some((c) => c.camera.pitch === 0 && c.camera.heading === 0)).toBe(true);
      expect(useUi.getState().following).toBe(false);
    });
  });
});
