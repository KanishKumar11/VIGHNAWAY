import { useEffect } from 'react';
import { advanceVehicle, buildIncidentIndex } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { evalContext, getGraph } from '@/lib/engine';
import { useActivity } from '@/stores/activity';
import { connectionMode, useConnection } from '@/stores/connection';
import { useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { schedulePlan } from './planner';

/**
 * Wires the engine to the stores (mounted once, in the root layout):
 * - re-plan after incident, profile or destination changes (debounced);
 * - advance the simulated vehicle with sim-clock deltas, or a labelled local timer when the API is
 *   unreachable during a trip;
 */
export function useTripEngine(): void {
  useEffect(() => {
    schedulePlan({ showEvaluating: !useTrip.getState().plan, delayMs: 0 });

    const unsubIncidents = useIncidents.subscribe((s, prev) => {
      if (s.byId !== prev.byId) schedulePlan();
    });
    const unsubSettings = useSettings.subscribe((s, prev) => {
      if (s.profile !== prev.profile || s.preferLit !== prev.preferLit) {
        // A different profile is a different graph: a running trip restarts from planning.
        if (useTrip.getState().mode !== 'planning') useTrip.getState().endTrip();
        // A beat after the tap, so the chosen option repaints before the engine holds the JS thread.
        schedulePlan({ showEvaluating: true, delayMs: 60 });
      }
    });
    const unsubSim = useSim.subscribe((s, prev) => {
      if (s.simTimeS !== prev.simTimeS) advanceTo(s.simTimeS);
    });
    return () => {
      unsubIncidents();
      unsubSettings();
      unsubSim();
    };
  }, []);

  // Local timer fallback: only during a trip, only when the server clock is not reachable.
  const enRoute = useTrip((s) => s.mode === 'en_route');
  const mode = useConnection((s) => connectionMode(s.net, s.socket));
  const fixture = useSettings((s) => s.fixtureMode !== null);
  // Live mode has no simulated vehicle, so no local timer either.
  const live = useSettings((s) => s.dataMode === 'live');
  const useLocal = enRoute && !fixture && !live && (mode === 'offline' || mode === 'unreachable');
  useEffect(() => {
    if (!useLocal) {
      useSim.getState().setClockSource('server');
      return;
    }
    useSim.getState().setClockSource('local');
    const id = setInterval(() => {
      const sim = useSim.getState();
      sim.advanceLocal(sim.simSecondsPerRealSecond);
    }, 1000);
    return () => clearInterval(id);
  }, [useLocal]);
}

function advanceTo(simTimeS: number): void {
  const trip = useTrip.getState();
  if (trip.mode !== 'en_route' || !trip.vehicle || useSettings.getState().fixtureMode) return;
  // Live mode: the vehicle follows the device location (deviceTrip.ts), never the clock.
  if (useSettings.getState().dataMode === 'live') return;
  const last = trip.vehicleAtS ?? simTimeS;
  const dt = simTimeS - last;
  if (dt <= 0) {
    if (dt < 0) trip.setVehicle(trip.vehicle, simTimeS);
    return;
  }
  const { scenario, graphFile } = useScenario.getState();
  const graph = getGraph(graphFile, useSettings.getState().profile);
  const index = buildIncidentIndex(Object.values(useIncidents.getState().byId));
  const next = advanceVehicle(graph, trip.vehicle, dt, index, evalContext(scenario, simTimeS), scenario.demoTrip.vehicleSpeedFactor);
  trip.setVehicle(next, simTimeS);
  if (next.arrived) {
    trip.arrive();
    const place = placeById(scenario, trip.destinationId);
    useActivity.getState().add({ atS: simTimeS, kind: 'trip', text: t('activityArrived', { place: place?.name ?? '' }) });
  }
}
