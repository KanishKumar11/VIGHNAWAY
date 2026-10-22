import { describe, expect, it } from 'vitest';
import type { Incident, IncidentsResponse, IncidentUpserted } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import {
  applyJoinAck,
  applyReset,
  applySnapshot,
  applyUpserted,
  incidentList,
  initialSyncState,
  resyncSinceSeq,
  type SyncState,
} from '@/lib/sync';
import { makeIncident, scenarioEvent } from './helpers';

const SID = andheriScenario.id;
const point = scenarioEvent(andheriScenario, 'ev01-ankle').report.point;
const inc = (id: string, seq: number, over: Partial<Incident> = {}): Incident => makeIncident({ id, type: 'flood', depth: 'ankle', point, seq, ...over });
const up = (i: Incident): IncidentUpserted => ({ scenarioId: SID, seq: i.seq, incident: i, summary: `${i.id} changed` });
const snap = (over: Partial<IncidentsResponse>): IncidentsResponse => ({ scenarioId: SID, seq: 0, full: true, runId: 'run-1', simTimeS: 0, incidents: [], ...over });

describe('resync rule', () => {
  it('first sync is a full snapshot (no sinceSeq), then sinceSeq = lastSeq', () => {
    let s = initialSyncState(SID);
    expect(resyncSinceSeq(s)).toBeNull();
    s = applySnapshot(s, snap({ seq: 2, incidents: [inc('a', 1), inc('b', 2)] }));
    expect(s.lastSeq).toBe(2);
    expect(Object.keys(s.incidents)).toEqual(['a', 'b']);
    expect(resyncSinceSeq(s)).toBe(2);
  });

  it('applies incident.upserted only when seq > lastSeq', () => {
    let s = applySnapshot(initialSyncState(SID), snap({ seq: 2, incidents: [inc('a', 1), inc('b', 2)] }));
    const stale = applyUpserted(s, up(inc('a', 2, { status: 'dismissed' })));
    expect(stale.outcome).toBe('ignored');
    expect(stale.state).toBe(s);
    const next = applyUpserted(s, up(inc('a', 3, { status: 'corroborated' })));
    expect(next.outcome).toBe('applied');
    s = next.state;
    expect(s.lastSeq).toBe(3);
    expect(s.incidents.a!.status).toBe('corroborated');
  });

  it('detects a gap and leaves state untouched so the resync fetches everything after lastSeq', () => {
    const s = applySnapshot(initialSyncState(SID), snap({ seq: 2, incidents: [inc('a', 1), inc('b', 2)] }));
    const r = applyUpserted(s, up(inc('c', 5)));
    expect(r.outcome).toBe('gap');
    expect(r.state).toBe(s);
    expect(resyncSinceSeq(r.state)).toBe(2);
    // The resync response merges by id.
    const merged = applySnapshot(r.state, snap({ seq: 5, full: false, incidents: [inc('b', 3, { status: 'verified' }), inc('d', 4), inc('c', 5)] }));
    expect(merged.lastSeq).toBe(5);
    expect(Object.keys(merged.incidents).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.incidents.b!.status).toBe('verified');
  });

  it('ignores events for other scenarios', () => {
    const s = initialSyncState(SID);
    expect(applyUpserted(s, { ...up(inc('a', 1)), scenarioId: 'other' }).outcome).toBe('foreign');
  });

  it('does not let an older snapshot overwrite a newer streamed version', () => {
    let s = applySnapshot(initialSyncState(SID), snap({ seq: 1, incidents: [inc('a', 1)] }));
    s = applyUpserted(s, up(inc('a', 2, { status: 'corroborated' }))).state;
    s = applySnapshot(s, snap({ seq: 1, full: false, incidents: [inc('a', 1)] }));
    expect(s.incidents.a!.seq).toBe(2);
    expect(s.lastSeq).toBe(2);
  });

  it('clears on sim.reset and resyncs with no sinceSeq', () => {
    let s = applySnapshot(initialSyncState(SID), snap({ seq: 3, incidents: [inc('a', 3)] }));
    s = applyReset(s, { scenarioId: SID, runId: 'run-2', seq: 0 });
    expect(s.incidents).toEqual({});
    expect(resyncSinceSeq(s)).toBeNull();
    s = applySnapshot(s, snap({ runId: 'run-2', seq: 0 }));
    expect(s.runId).toBe('run-2');
    expect(s.lastSeq).toBe(0);
  });

  it('starts over when the join ack or a snapshot belongs to another run', () => {
    const s: SyncState = applySnapshot(initialSyncState(SID), snap({ seq: 3, incidents: [inc('a', 3)] }));
    const ack = applyJoinAck(s, { runId: 'run-2', seq: 0 });
    expect(ack.reset).toBe(true);
    expect(ack.state.incidents).toEqual({});
    expect(applyJoinAck(s, { runId: 'run-1', seq: 3 }).reset).toBe(false);
    const replaced = applySnapshot(s, snap({ runId: 'run-2', seq: 1, full: false, incidents: [inc('z', 1)] }));
    expect(Object.keys(replaced.incidents)).toEqual(['z']);
  });

  it('lists incidents sorted by id for the engine', () => {
    const s = applySnapshot(initialSyncState(SID), snap({ seq: 2, incidents: [inc('b', 2), inc('a', 1)] }));
    expect(incidentList(s).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
