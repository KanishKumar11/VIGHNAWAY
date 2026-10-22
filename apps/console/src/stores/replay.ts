import { create } from 'zustand';
import type { HistoryEntry } from '@vighnaway/contracts';

/** Decision replay state. While active the console is read-only: no operator or sim actions. */
interface ReplayStore {
  /** Simulation second being replayed, or null when showing live. */
  atS: number | null;
  entries: HistoryEntry[] | null;
  runId: string | null;
  setEntries(runId: string, entries: HistoryEntry[]): void;
  seek(atS: number): void;
  exit(): void;
}

export const useReplay = create<ReplayStore>()((set) => ({
  atS: null,
  entries: null,
  runId: null,
  setEntries(runId, entries) {
    set({ runId, entries });
  },
  seek(atS) {
    set({ atS: Math.max(0, atS) });
  },
  exit() {
    set({ atS: null });
  },
}));

export const isReplaying = (): boolean => useReplay.getState().atS !== null;
