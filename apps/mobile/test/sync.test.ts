import { applyIncidentsResponse, applyReset, applyUpsert, emptySyncState, sinceSeqFor } from '@/lib/sync';
import { useIncidents } from '@/stores/incidents';
import { incident, response, SCENARIO, upsert } from './helpers';

describe('resync rule (docs/CONTRACTS.md)', () => {
  it('asks for a full fetch until a run is known, then sinceSeq=lastSeq', () => {
    expect(sinceSeqFor(emptySyncState)).toBeUndefined();
    const s = applyIncidentsResponse(emptySyncState, response(3, [incident('a', 3)], true));
    expect(s.lastSeq).toBe(3);
    expect(sinceSeqFor(s)).toBe(3);
  });

  it('full response replaces the set; partial merges by id with newer seq winning', () => {
    let s = applyIncidentsResponse(emptySyncState, response(2, [incident('a', 1), incident('b', 2)], true));
    s = applyIncidentsResponse(s, response(4, [incident('a', 4, { status: 'corroborated' })], false));
    expect(Object.keys(s.byId).sort()).toEqual(['a', 'b']);
    expect(s.byId.a!.status).toBe('corroborated');
    expect(s.lastSeq).toBe(4);
    // A stale copy in a later partial response never overwrites a newer version.
    s = applyIncidentsResponse(s, response(4, [incident('a', 1, { status: 'unverified' })], false));
    expect(s.byId.a!.status).toBe('corroborated');
    s = applyIncidentsResponse(s, response(5, [incident('c', 5)], true));
    expect(Object.keys(s.byId)).toEqual(['c']);
  });

  it('a new runId (reset elsewhere) replaces the set even when full is false', () => {
    const s1 = applyIncidentsResponse(emptySyncState, response(9, [incident('a', 9)], true, 'run-1'));
    const s2 = applyIncidentsResponse(s1, response(1, [incident('z', 1)], false, 'run-2'));
    expect(Object.keys(s2.byId)).toEqual(['z']);
    expect(s2.lastSeq).toBe(1);
    expect(s2.runId).toBe('run-2');
  });

  it('applies seq = lastSeq + 1, ignores old seq, asks for resync on a gap', () => {
    const base = applyIncidentsResponse(emptySyncState, response(5, [incident('a', 5)], true));
    const next = applyUpsert(base, upsert(incident('b', 6)), SCENARIO);
    expect(next.kind).toBe('applied');
    if (next.kind !== 'applied') return;
    expect(next.state.lastSeq).toBe(6);
    expect(next.previous).toBeNull();
    expect(applyUpsert(next.state, upsert(incident('a', 6)), SCENARIO).kind).toBe('ignored');
    expect(applyUpsert(next.state, upsert(incident('a', 4)), SCENARIO).kind).toBe('ignored');
    expect(applyUpsert(next.state, upsert(incident('c', 8)), SCENARIO).kind).toBe('resync');
    expect(applyUpsert(next.state, upsert(incident('c', 7)), 'another-scenario').kind).toBe('ignored');
  });

  it('reset clears everything so the next fetch is full', () => {
    const s = applyReset();
    expect(s.byId).toEqual({});
    expect(sinceSeqFor(s)).toBeUndefined();
  });
});

describe('incidents store', () => {
  beforeEach(() => useIncidents.getState().clearCache());

  it('tracks lastSeq and cache times through response, upsert and reset', () => {
    const st = useIncidents.getState();
    st.applyResponse(response(2, [incident('a', 2)], true));
    expect(useIncidents.getState().lastSeq).toBe(2);
    expect(useIncidents.getState().cachedAtSimS).toBe(100);
    expect(useIncidents.getState().cachedAtWallMs).not.toBeNull();

    const r = useIncidents.getState().applyUpsert(upsert(incident('a', 3, { status: 'verified', updatedAtS: 300 })), SCENARIO);
    expect(r.kind).toBe('applied');
    expect(useIncidents.getState().byId.a!.status).toBe('verified');
    expect(useIncidents.getState().cachedAtSimS).toBe(300);

    expect(useIncidents.getState().applyUpsert(upsert(incident('b', 7)), SCENARIO).kind).toBe('resync');
    expect(useIncidents.getState().byId.b).toBeUndefined();

    useIncidents.getState().reset();
    expect(useIncidents.getState().byId).toEqual({});
    expect(useIncidents.getState().runId).toBeNull();
  });

  it('ignores live events while a design fixture is shown, and restores afterwards', () => {
    useIncidents.getState().applyResponse(response(2, [incident('a', 2)], true));
    useIncidents.getState().loadFixture([incident('fx', 1)]);
    expect(useIncidents.getState().applyUpsert(upsert(incident('b', 3)), SCENARIO).kind).toBe('ignored');
    expect(Object.keys(useIncidents.getState().byId)).toEqual(['fx']);
    useIncidents.getState().leaveFixture();
    expect(useIncidents.getState().fixture).toBe(false);
  });
});
