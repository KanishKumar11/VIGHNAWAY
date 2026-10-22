import type { Incident } from '@vighnaway/contracts';

/**
 * The evidence ladder for the newest demo-audience report, for the presenter panel. Corroboration
 * is a device heuristic; only an operator action sets Verified. Pure.
 */
export type LadderStep = 'unverified' | 'corroborated' | 'verified';
export type LadderState = 'done' | 'current' | 'todo';

const ORDER: readonly LadderStep[] = ['unverified', 'corroborated', 'verified'];

/** The newest open incident that only audience reports support, or null. */
export function newestAudienceIncident(incidents: readonly Incident[]): Incident | null {
  let best: Incident | null = null;
  for (const i of incidents) {
    if (!i.audienceOnly || i.status === 'resolved' || i.status === 'dismissed') continue;
    if (!best || i.seq > best.seq || (i.seq === best.seq && i.id > best.id)) best = i;
  }
  return best;
}

/** Which rung each step is on: steps below the incident's status are done, its own is current. */
export function audienceLadder(incident: Pick<Incident, 'status'> | null): { step: LadderStep; state: LadderState }[] {
  const at = incident ? ORDER.indexOf(incident.status as LadderStep) : -1;
  return ORDER.map((step, i) => ({ step, state: at < 0 ? 'todo' : i < at ? 'done' : i === at ? 'current' : 'todo' }));
}

export const audienceIncidents = (incidents: readonly Incident[]): Incident[] =>
  incidents.filter((i) => i.audienceOnly && i.status !== 'resolved' && i.status !== 'dismissed');
