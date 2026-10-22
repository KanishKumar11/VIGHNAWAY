'use client';

import { useEffect } from 'react';
import { rt } from '@/i18n/engineText';
import { createTrip, incidentsTrip, positionTrip, tickTrip, type TripEnv, type TripState } from '@/lib/demoTrip';
import { graphFor, scenarioFor } from '@/lib/scenario';
import { useScenarioStore } from '@/stores/scenario';
import { incidentList } from '@/lib/sync';
import { useLiveStore, type LiveState } from '@/stores/live';
import { useTripStore } from '@/stores/trip';

const envCache = new Map<string, TripEnv>();
/** Engine inputs for a scenario's demo trip (default: the scenario the console shows). */
export const tripEnv = (scenarioId: string = useScenarioStore.getState().id): TripEnv => {
  const scenario = scenarioFor(scenarioId);
  let env = envCache.get(scenario.id);
  if (!env) {
    env = { graph: graphFor(scenario.demoTrip.profile), scenario };
    envCache.set(scenario.id, env);
  }
  return env;
};

const runKey = (s: LiveState) => `${s.sync.scenarioId}:${s.resetCount}:${s.sync.runId ?? 'none'}`;

/**
 * Keeps the console's own plan for the demo trip in step with the live store. Inputs are only the
 * synced incident snapshot, the simulation time and the relayed vehicle position, the same inputs
 * the phone uses; optimistic operator actions never reach the engine.
 */
export function useDemoTripController(): void {
  const scenarioId = useScenarioStore((s) => s.id);
  useEffect(() => {
    const env = tripEnv(scenarioId);
    let key: string | null = null;
    // Last live clock seen. The trip's own clock can run ahead of it (a re-plan uses the newest
    // incident time), so only the live clock going backwards counts as a rewind.
    let lastLiveS = -1;

    const apply = (s: LiveState) => {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      if (s.sync.scenarioId !== env.scenario.id) return;
      const incidents = incidentList(s.sync);
      let trip: TripState | null = useTripStore.getState().trip;
      const before = trip;
      const k = runKey(s);
      const rewound = lastLiveS >= 0 && s.simTimeS < lastLiveS - 1;
      lastLiveS = s.simTimeS;
      if (!trip || k !== key || rewound) {
        key = k;
        trip = createTrip(env, incidents, s.simTimeS);
      }
      if (s.tripPosition && trip.phone !== s.tripPosition) {
        trip = positionTrip(env, trip, s.tripPosition);
      }
      if (s.simTimeS > trip.simTimeS) trip = tickTrip(env, trip, s.simTimeS, incidents);
      trip = incidentsTrip(env, trip, incidents, s.simTimeS);
      if (trip === before) return;
      const ran = !before || trip.plan !== before.plan;
      useTripStore.getState().set(trip, ran && typeof performance !== 'undefined' ? performance.now() - t0 : null);
      if (trip.change && trip.change.id !== before?.change?.id) {
        useLiveStore.getState().addTicker({ key: `change-${k}-${trip.change.id}`, atS: trip.change.atS, text: rt(trip.change.messageText, trip.change.message) });
      }
    };

    // A trip planned for the other scenario is never shown while this one starts.
    const shown = useTripStore.getState().trip;
    if (shown && !env.scenario.places.some((p) => p.id === shown.destinationId)) useTripStore.setState({ trip: null });
    apply(useLiveStore.getState());
    return useLiveStore.subscribe((s) => apply(s));
  }, [scenarioId]);
}
