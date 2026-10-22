import type { HistoryResponse, Incident, PlanResult, Profile, Scenario } from '@vighnaway/contracts';
import { incidentsAtSeq, PROFILES } from '@vighnaway/contracts';
import type { PlanTripInput, Receipt, ReceiptVerification } from '@vighnaway/engine';
import { buildReceipt, decodeReceipt, encodeReceipt, planTrip, verifyReceipt } from '@vighnaway/engine';
import { graphFor, SCENARIOS } from './scenario';

/**
 * Decision receipts for the console (docs/TASKS.md P1-2). A receipt is made from the live incident
 * set at one moment; /verify rebuilds the same set from the history endpoint and re-runs the engine.
 */

const placeNode = (scenario: Scenario, id: string): string => scenario.places.find((p) => p.id === id)?.nodeId ?? '';

/** The trip a receipt describes: origin to destination as the engine plans it, with no route being followed. */
export function receiptInput(scenario: Scenario, incidents: readonly Incident[], nowS: number, destinationId: string): PlanTripInput {
  return {
    graph: graphFor(scenario.demoTrip.profile),
    origin: placeNode(scenario, scenario.demoTrip.originId),
    destination: placeNode(scenario, destinationId),
    incidents,
    nowS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
    places: scenario.places,
    destinationPlaceId: destinationId,
  };
}

export interface MadeReceipt {
  receipt: Receipt;
  token: string;
  plan: PlanResult;
}

/** Snapshot of the decision now: `seq` is the last incident seq the console has applied. */
export function makeReceipt(scenario: Scenario, incidents: readonly Incident[], seq: number, nowS: number, destinationId: string): MadeReceipt {
  const input = receiptInput(scenario, incidents, nowS, destinationId);
  const plan = planTrip(input);
  const receipt = buildReceipt({ scenarioId: scenario.id, seq, simulated: scenario.mode !== 'live' }, input, plan);
  return { receipt, token: encodeReceipt(receipt), plan };
}

/** A receipt token from a bare token, a /verify link or a query string. */
export function tokenFromText(text: string): string {
  const s = text.trim();
  const m = /[?&]r=([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1]! : s;
}

export type VerifyOutcome =
  | { kind: 'invalid' }
  | { kind: 'unknown_scenario'; receipt: Receipt }
  | { kind: 'checked'; receipt: Receipt; scenario: Scenario; verification: ReceiptVerification; incidentCount: number };

export const parseReceipt = (token: string): Receipt | null => decodeReceipt(tokenFromText(token));

/** Re-runs a receipt's decision from the recorded history. Pure: the caller fetches `history`. */
export function verifyAgainstHistory(receipt: Receipt, history: HistoryResponse): VerifyOutcome {
  const scenario = SCENARIOS[receipt.scenarioId];
  if (!scenario || history.scenarioId !== receipt.scenarioId || !(PROFILES as readonly string[]).includes(receipt.profile)) {
    return { kind: 'unknown_scenario', receipt };
  }
  const incidents = incidentsAtSeq(history.entries, receipt.seq);
  const input: PlanTripInput = {
    graph: graphFor(receipt.profile as Profile),
    origin: receipt.originNodeId,
    destination: receipt.destinationNodeId,
    incidents,
    nowS: receipt.evaluatedAtS,
    alerts: scenario.alerts,
    hasAlertInformation: scenario.hasAlertInformation,
    places: scenario.places,
    destinationPlaceId: receipt.destinationPlaceId,
    previousRecommendation: receipt.previousRouteId ? { routeId: receipt.previousRouteId, edgeIds: receipt.previousRouteId.split('|') } : null,
  };
  return { kind: 'checked', receipt, scenario, verification: verifyReceipt(receipt, input), incidentCount: incidents.length };
}
