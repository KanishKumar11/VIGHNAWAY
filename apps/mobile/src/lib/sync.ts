import type { Incident, IncidentsResponse, IncidentUpserted } from '@vighnaway/contracts';

/**
 * Incident sync state and the resync rule from docs/CONTRACTS.md, as pure functions so they can be
 * tested without a socket:
 *
 * - On every connect: join, then GET /incidents?sinceSeq=<lastSeq> before trusting the stream.
 * - Apply incident.upserted only if seq > lastSeq; on a gap (seq > lastSeq + 1) resync.
 * - On sim.reset (or a new runId): clear incidents and resync with no sinceSeq.
 */
export interface IncidentSyncState {
  byId: Record<string, Incident>;
  lastSeq: number;
  runId: string | null;
}

export const emptySyncState: IncidentSyncState = { byId: {}, lastSeq: 0, runId: null };

/** Query value for the next resync: undefined means a full fetch. */
export function sinceSeqFor(state: IncidentSyncState): number | undefined {
  return state.runId === null ? undefined : state.lastSeq;
}

/** Merge a GET /incidents response. `full` replaces the set; otherwise merge by id, newer seq wins. */
export function applyIncidentsResponse(state: IncidentSyncState, res: IncidentsResponse): IncidentSyncState {
  const runChanged = state.runId !== null && state.runId !== res.runId;
  if (res.full || runChanged) {
    const byId: Record<string, Incident> = {};
    for (const inc of res.incidents) byId[inc.id] = inc;
    return { byId, lastSeq: res.seq, runId: res.runId };
  }
  const byId = { ...state.byId };
  for (const inc of res.incidents) {
    const prev = byId[inc.id];
    if (!prev || inc.seq >= prev.seq) byId[inc.id] = inc;
  }
  return { byId, lastSeq: Math.max(state.lastSeq, res.seq), runId: res.runId };
}

export type UpsertResult =
  | { kind: 'applied'; state: IncidentSyncState; previous: Incident | null }
  | { kind: 'ignored' }
  | { kind: 'resync' };

/** Apply one incident.upserted event following the seq rule. */
export function applyUpsert(state: IncidentSyncState, evt: IncidentUpserted, scenarioId: string): UpsertResult {
  if (evt.scenarioId !== scenarioId) return { kind: 'ignored' };
  if (evt.seq <= state.lastSeq) return { kind: 'ignored' };
  if (evt.seq > state.lastSeq + 1) return { kind: 'resync' };
  const previous = state.byId[evt.incident.id] ?? null;
  return {
    kind: 'applied',
    previous,
    state: { ...state, byId: { ...state.byId, [evt.incident.id]: evt.incident }, lastSeq: evt.seq },
  };
}

/** sim.reset: drop everything; the next fetch must be full. */
export function applyReset(): IncidentSyncState {
  return { ...emptySyncState };
}
