import { create } from 'zustand';
import type { SimPlayState, SimState } from '@vighnaway/contracts';
import { KEYS, storage } from '@/lib/storage';

/**
 * Simulation clock. The server owns it (sim.state, sim.tick). When the API is unreachable during a
 * trip, the vehicle advances on a local timer instead and the UI says so (clockSource 'local').
 */
interface SimStore {
  simTimeS: number;
  state: SimPlayState;
  runId: string | null;
  simSecondsPerRealSecond: number;
  clockSource: 'server' | 'local';
  applyState: (s: SimState) => void;
  applyTick: (simTimeS: number, runId: string) => void;
  advanceLocal: (dtS: number) => void;
  setClockSource: (src: 'server' | 'local') => void;
  setFixtureTime: (simTimeS: number) => void;
  /** New scenario: clear the run; live mode starts from the wall clock (seconds since clockStartsAt). */
  resetForScenario: (live: boolean, clockStartsAt: string) => void;
  /** Live mode between server ticks: follow the wall clock. */
  setWallTime: (simTimeS: number) => void;
}

/** Live clock: wall time as seconds since the scenario's clockStartsAt. */
export const wallSimTimeS = (clockStartsAt: string, nowMs = Date.now()): number => {
  const start = Date.parse(clockStartsAt);
  return Number.isFinite(start) ? Math.max(0, Math.floor((nowMs - start) / 1000)) : 0;
};

const saved = storage.getJSON<{ simTimeS: number; runId: string | null }>(KEYS.sim);

const persist = (simTimeS: number, runId: string | null) => storage.setJSON(KEYS.sim, { simTimeS, runId });

export const useSim = create<SimStore>()((set, get) => ({
  simTimeS: saved?.simTimeS ?? 0,
  state: 'idle',
  runId: saved?.runId ?? null,
  simSecondsPerRealSecond: 10,
  clockSource: 'server',
  applyState: (s) => {
    set({ simTimeS: s.simTimeS, state: s.state, runId: s.runId, simSecondsPerRealSecond: s.simSecondsPerRealSecond, clockSource: 'server' });
    persist(s.simTimeS, s.runId);
  },
  applyTick: (simTimeS, runId) => {
    // Never move the clock backwards within a run (a late tick after a step).
    const cur = get();
    if (cur.runId === runId && simTimeS < cur.simTimeS) return;
    set({ simTimeS, runId, clockSource: 'server' });
    if (simTimeS % 10 === 0) persist(simTimeS, runId);
  },
  advanceLocal: (dtS) => set((s) => ({ simTimeS: s.simTimeS + Math.max(0, Math.round(dtS)), clockSource: 'local' })),
  setClockSource: (clockSource) => set({ clockSource }),
  setFixtureTime: (simTimeS) => set({ simTimeS }),
  resetForScenario: (live, clockStartsAt) => {
    const simTimeS = live ? wallSimTimeS(clockStartsAt) : 0;
    set({ simTimeS, state: 'idle', runId: null, clockSource: 'server', simSecondsPerRealSecond: live ? 1 : 10 });
    persist(simTimeS, null);
  },
  setWallTime: (simTimeS) => {
    if (simTimeS > get().simTimeS) set({ simTimeS });
  },
}));
