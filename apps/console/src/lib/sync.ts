import type { Incident, IncidentsResponse, IncidentUpserted, SimReset } from '@vighnaway/contracts';

/**
 * Incident sync state and the resync rule from docs/CONTRACTS.md, as pure functions so they can
 * be tested with fake events:
 * - on every connect: join, then GET incidents?sinceSeq=<lastSeq> before trusting the stream;
 * - apply incident.upserted only when seq > lastSeq; on a gap (seq > lastSeq + 1) resync;
 * - on sim.reset clear incidents and resync with no sinceSeq.
 */
export interface SyncState {
  scenarioId: string;
  runId: string | null;
  lastSeq: number;
  incidents: Record<string, Incident>;
}

export const initialSyncState = (scenarioId: string): SyncState => ({
  scenarioId,
  runId: null,
  lastSeq: 0,
  incidents: {},
});

/** Query for the next resync: null means a full snapshot (no sinceSeq). */
export const resyncSinceSeq = (s: SyncState): number | null => (s.runId === null || s.lastSeq === 0 ? null : s.lastSeq);

export function applySnapshot(s: SyncState, resp: IncidentsResponse): SyncState {
  if (resp.scenarioId !== s.scenarioId) return s;
  const runChanged = s.runId !== null && resp.runId !== s.runId;
  let incidents: Record<string, Incident>;
  if (resp.full || runChanged) {
    incidents = {};
    // Events the stream delivered after the snapshot was taken stay (same run only).
    if (!runChanged) for (const inc of Object.values(s.incidents)) if (inc.seq > resp.seq) incidents[inc.id] = inc;
  } else {
    incidents = { ...s.incidents };
  }
  for (const inc of resp.incidents) {
    const prev = incidents[inc.id];
    if (!prev || inc.seq >= prev.seq) incidents[inc.id] = inc;
  }
  const lastSeq = runChanged || resp.full ? Math.max(resp.seq, ...Object.values(incidents).map((i) => i.seq), 0) : Math.max(s.lastSeq, resp.seq);
  return { ...s, runId: resp.runId, lastSeq, incidents };
}

export type UpsertOutcome = 'applied' | 'ignored' | 'gap' | 'foreign';

export function applyUpserted(s: SyncState, ev: IncidentUpserted): { state: SyncState; outcome: UpsertOutcome } {
  if (ev.scenarioId !== s.scenarioId) return { state: s, outcome: 'foreign' };
  if (ev.seq <= s.lastSeq) return { state: s, outcome: 'ignored' };
  if (ev.seq > s.lastSeq + 1) return { state: s, outcome: 'gap' };
  return {
    state: { ...s, lastSeq: ev.seq, incidents: { ...s.incidents, [ev.incident.id]: ev.incident } },
    outcome: 'applied',
  };
}

export function applyReset(s: SyncState, ev: SimReset): SyncState {
  if (ev.scenarioId !== s.scenarioId) return s;
  // lastSeq 0 and runId null make the next resync a full snapshot.
  return { ...s, runId: null, lastSeq: 0, incidents: {} };
}

/** Join ack from a different run (the server reset while we were away): start over. */
export function applyJoinAck(s: SyncState, ack: { runId: string; seq: number }): { state: SyncState; reset: boolean } {
  if (s.runId !== null && ack.runId !== s.runId) return { state: { ...s, runId: null, lastSeq: 0, incidents: {} }, reset: true };
  return { state: s, reset: false };
}

/** Incidents sorted by id: the order the engine expects and a stable key for memoisation. */
export function incidentList(s: Pick<SyncState, 'incidents'>): Incident[] {
  return Object.values(s.incidents).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Changes whenever any incident that could affect routing changes. */
export function incidentsKey(list: readonly Incident[]): string {
  return list.map((i) => `${i.id}@${i.seq}`).join('|');
}
