import { describe, expect, it } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { createLiveStore, displayIncidents, TICKER_LENGTH } from '@/stores/live';
import { optimisticIncident } from '@/hooks/useOperatorActions';
import { makeIncident, scenarioEvent } from './helpers';

const SID = andheriScenario.id;
const point = scenarioEvent(andheriScenario, 'ev02-knee').report.point;
const inc = (seq: number, over: Partial<Incident> = {}): Incident =>
  makeIncident({ id: 'flood-1', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, point, seq, ...over });

function seeded() {
  const store = createLiveStore(SID);
  store.getState().applySnapshot({ scenarioId: SID, seq: 1, full: true, runId: 'run-1', simTimeS: 180, incidents: [inc(1)] });
  return store;
}

describe('live store', () => {
  it('shows an optimistic Verify, rolls it back on error, and never changes the synced incident', () => {
    const store = seeded();
    const before = store.getState().sync.incidents['flood-1']!;
    store.getState().setOptimistic(optimisticIncident(before, 'verify', 200));
    expect(displayIncidents(store.getState())[0]!.status).toBe('verified');
    expect(store.getState().sync.incidents['flood-1']!.status).toBe('corroborated');
    store.getState().rollback('flood-1');
    expect(displayIncidents(store.getState())[0]!.status).toBe('corroborated');
  });

  it('keeps a confirmed action visible until the stream delivers that seq', () => {
    const store = seeded();
    const verified = inc(2, { status: 'verified', verifiedBy: 'operator', verifiedAtS: 200 });
    store.getState().setOptimistic(optimisticIncident(inc(1), 'verify', 200));
    store.getState().confirm(verified);
    expect(store.getState().optimistic).toEqual({});
    expect(displayIncidents(store.getState())[0]!.status).toBe('verified');
    expect(store.getState().sync.lastSeq).toBe(1);
    expect(store.getState().applyUpserted({ scenarioId: SID, seq: 2, incident: verified, summary: 'verified' })).toBe('applied');
    expect(store.getState().confirmed).toEqual({});
    expect(displayIncidents(store.getState())[0]!.status).toBe('verified');
  });

  it('pulses an incident when the stream upgrades it to Verified', () => {
    const store = seeded();
    store.getState().applyUpserted({ scenarioId: SID, seq: 2, incident: inc(2, { status: 'verified' }), summary: 'verified' });
    expect(store.getState().pulses['flood-1']).toBe(1);
  });

  it('keeps the last five ticker lines, newest first', () => {
    const store = seeded();
    for (let s = 2; s <= 8; s++) store.getState().applyUpserted({ scenarioId: SID, seq: s, incident: inc(s), summary: `line ${s}` });
    const t = store.getState().ticker;
    expect(t).toHaveLength(TICKER_LENGTH);
    expect(t[0]!.text).toBe('line 8');
  });

  it('resets everything on sim.reset', () => {
    const store = seeded();
    store.getState().setTripPosition(null);
    const n = store.getState().resetCount;
    store.getState().applyReset({ scenarioId: SID, runId: 'run-2', seq: 0 });
    expect(store.getState().sync.incidents).toEqual({});
    expect(store.getState().simTimeS).toBe(0);
    expect(store.getState().resetCount).toBe(n + 1);
  });

  it('a fake socket session: join, resync, stream, gap, resync', () => {
    const store = createLiveStore(SID);
    expect(store.getState().applyJoinAck({ runId: 'run-1', seq: 0 })).toBe(false);
    store.getState().applySnapshot({ scenarioId: SID, seq: 0, full: true, runId: 'run-1', simTimeS: 0, incidents: [] });
    expect(store.getState().applyUpserted({ scenarioId: SID, seq: 1, incident: inc(1), summary: 'a' })).toBe('applied');
    expect(store.getState().applyUpserted({ scenarioId: SID, seq: 3, incident: inc(3), summary: 'c' })).toBe('gap');
    store.getState().applySnapshot({ scenarioId: SID, seq: 3, full: false, runId: 'run-1', simTimeS: 30, incidents: [inc(3)] });
    expect(store.getState().sync.lastSeq).toBe(3);
    expect(store.getState().simTimeS).toBe(30);
    expect(store.getState().applyUpserted({ scenarioId: SID, seq: 3, incident: inc(3), summary: 'dup' })).toBe('ignored');
  });
});
