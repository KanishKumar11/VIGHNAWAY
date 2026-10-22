import type { HospitalStatesResponse, Incident } from '@vighnaway/contracts';
import { alertContext, assignHospitals, type HospitalAssignment, type HospitalState } from '@vighnaway/engine';
import type { TripEnv } from '@/lib/demoTrip';

/** How many simulated callers the "Hospital load" card plans together (P2-4.c). */
export const SIMULATED_CALLERS = 3;

export const statesOf = (r: HospitalStatesResponse | undefined): Record<string, HospitalState> =>
  Object.fromEntries((r?.hospitals ?? []).filter((h) => h.state !== 'accepting').map((h) => [h.placeId, h.state]));

/**
 * Plans a batch of simulated callers who all start at the demo origin and ask for "the nearest hospital".
 * The engine hands each one the hospital with the lowest ranking cost (arrival time, plus the operator-set
 * state, plus the callers already sent there). Pure and deterministic: same inputs, same assignments.
 */
export function assignCallers(
  env: TripEnv,
  incidents: readonly Incident[],
  nowS: number,
  states: Readonly<Record<string, HospitalState>>,
  callers: number = SIMULATED_CALLERS,
): HospitalAssignment[] {
  const { scenario, graph } = env;
  const origin = scenario.places.find((p) => p.id === scenario.demoTrip.originId);
  if (!origin) return [];
  return assignHospitals({
    graph,
    places: scenario.places,
    states,
    trips: Array.from({ length: callers }, (_, i) => ({ id: `caller-${i + 1}`, origin: origin.nodeId })),
    incidents,
    ctx: alertContext(scenario.alerts, scenario.hasAlertInformation, nowS),
  });
}
