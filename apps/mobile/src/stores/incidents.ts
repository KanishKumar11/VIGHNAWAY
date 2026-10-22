import { useMemo } from 'react';
import { create } from 'zustand';
import type { Incident, IncidentsResponse, IncidentUpserted } from '@vighnaway/contracts';
import { KEYS, storage } from '@/lib/storage';
import { useScenario } from './scenario';
import {
  applyIncidentsResponse,
  applyReset,
  applyUpsert,
  emptySyncState,
  type IncidentSyncState,
  type UpsertResult,
} from '@/lib/sync';

interface Persisted extends IncidentSyncState {
  /** Simulation time of the last successful sync, for "using incidents from 14:12". */
  cachedAtSimS: number | null;
  /** Wall-clock time of the last successful sync, for "(6 min old)". */
  cachedAtWallMs: number | null;
}

interface IncidentsState extends Persisted {
  /** True while incidents come from a design fixture instead of the API. */
  fixture: boolean;
  applyResponse: (res: IncidentsResponse) => void;
  applyUpsert: (evt: IncidentUpserted, scenarioId: string) => UpsertResult;
  /** Applies a burst of events in order with one store update (one re-render, one re-plan). */
  applyUpserts: (evts: IncidentUpserted[], scenarioId: string) => UpsertResult[];
  reset: () => void;
  clearCache: () => void;
  loadFixture: (incidents: Incident[]) => void;
  leaveFixture: () => void;
}

const saved = storage.getJSON<Persisted>(KEYS.incidents);

const emptyPersisted: Persisted = { ...emptySyncState, cachedAtSimS: null, cachedAtWallMs: null };

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useIncidents = create<IncidentsState>()((set, get) => {
  const persistSoon = () => {
    if (get().fixture) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const { byId, lastSeq, runId, cachedAtSimS, cachedAtWallMs } = get();
      storage.setJSON(KEYS.incidents, { byId, lastSeq, runId, cachedAtSimS, cachedAtWallMs });
    }, 300);
  };
  return {
    ...emptyPersisted,
    ...saved,
    fixture: false,
    applyResponse: (res) => {
      if (get().fixture) return;
      const next = applyIncidentsResponse(get(), res);
      set({ ...next, cachedAtSimS: res.simTimeS, cachedAtWallMs: Date.now() });
      persistSoon();
    },
    applyUpsert: (evt, scenarioId) => {
      if (get().fixture) return { kind: 'ignored' };
      const r = applyUpsert(get(), evt, scenarioId);
      if (r.kind === 'applied') {
        set({ ...r.state, cachedAtSimS: Math.max(get().cachedAtSimS ?? 0, evt.incident.updatedAtS), cachedAtWallMs: Date.now() });
        persistSoon();
      }
      return r;
    },
    applyUpserts: (evts, scenarioId) => {
      if (get().fixture) return evts.map(() => ({ kind: 'ignored' }) as const);
      let state: IncidentSyncState = get();
      let cachedAtSimS = get().cachedAtSimS ?? 0;
      let applied = false;
      let resync = false;
      const results = evts.map((evt): UpsertResult => {
        // After a gap the rest waits for the resync fetch, which returns them anyway.
        if (resync) return { kind: 'ignored' };
        const r = applyUpsert(state, evt, scenarioId);
        if (r.kind === 'applied') {
          state = r.state;
          applied = true;
          cachedAtSimS = Math.max(cachedAtSimS, evt.incident.updatedAtS);
        } else if (r.kind === 'resync') resync = true;
        return r;
      });
      if (applied) {
        set({ byId: state.byId, lastSeq: state.lastSeq, runId: state.runId, cachedAtSimS, cachedAtWallMs: Date.now() });
        persistSoon();
      }
      return results;
    },
    reset: () => {
      set({ ...applyReset() });
      persistSoon();
    },
    clearCache: () => {
      set({ ...emptyPersisted });
      storage.remove(KEYS.incidents);
    },
    loadFixture: (incidents) => {
      const byId: Record<string, Incident> = {};
      for (const i of incidents) byId[i.id] = i;
      set({ byId, fixture: true, lastSeq: Math.max(0, ...incidents.map((i) => i.seq)) });
    },
    leaveFixture: () => {
      const restored = storage.getJSON<Persisted>(KEYS.incidents) ?? emptyPersisted;
      set({ ...emptyPersisted, ...restored, fixture: false });
    },
  };
});

/** Incident list, recomputed only when the incident map changes. */
export function useIncidentList(): Incident[] {
  const byId = useIncidents((s) => s.byId);
  // The corridor map has no incident data: the scenario's incidents belong to Andheri only.
  const roadsOnly = useScenario((s) => s.region !== 'andheri');
  return useMemo(() => (roadsOnly ? NONE : Object.values(byId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))), [byId, roadsOnly]);
}

const NONE: Incident[] = [];
