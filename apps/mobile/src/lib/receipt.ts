import type { Incident, Scenario } from '@vighnaway/contracts';
import type { Graph } from '@vighnaway/engine';
import { buildReceipt, encodeReceipt, planTrip } from '@vighnaway/engine';

/**
 * Decision receipt for a shared route (docs/TASKS.md P1-2.c). The console's /verify page re-runs
 * the same engine on the recorded incident history and shows whether the same decision comes out.
 */
export interface PhoneReceipt {
  /** First 8 characters of the plan hash, readable aloud or in a text message. */
  hash: string;
  /** /verify link on the control-room console; null when no console address is configured. */
  url: string | null;
}

export function phoneReceipt(args: {
  scenario: Scenario;
  graph: Graph;
  incidents: readonly Incident[];
  seq: number;
  nowS: number;
  originId: string;
  destinationId: string;
  consoleUrl: string;
}): PhoneReceipt | null {
  const { scenario, graph } = args;
  const origin = scenario.places.find((p) => p.id === args.originId);
  const dest = scenario.places.find((p) => p.id === args.destinationId);
  if (!origin || !dest) return null;
  const input = {
    graph,
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents: args.incidents,
    nowS: args.nowS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
    places: scenario.places,
    destinationPlaceId: dest.id,
  };
  const plan = planTrip(input);
  const receipt = buildReceipt({ scenarioId: scenario.id, seq: args.seq, simulated: scenario.mode !== 'live' }, input, plan);
  const base = args.consoleUrl.replace(/\/+$/, '');
  return { hash: receipt.planHash.slice(0, 8), url: base ? `${base}/verify?r=${encodeReceipt(receipt)}` : null };
}
