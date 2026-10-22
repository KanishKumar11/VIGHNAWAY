import { create } from 'zustand';
import { KEYS, storage } from '@/lib/storage';

export type ActivityKind =
  | 'route_changed'
  | 'unchanged'
  | 'incident'
  | 'pending_report'
  | 'report_sent'
  | 'report_failed'
  | 'trip'
  | 'no_viable_route'
  | 'warning';

export interface ActivityEntry {
  id: string;
  /** Simulation seconds when it happened. */
  atS: number;
  kind: ActivityKind;
  text: string;
  /** Used to drop repeats of the same notice (e.g. the same unchanged-with-hazard message). */
  dedupeKey?: string;
}

const MAX = 100;

interface ActivityState {
  entries: ActivityEntry[];
  add: (e: Omit<ActivityEntry, 'id'>) => boolean;
  update: (id: string, patch: Partial<ActivityEntry>) => void;
  clear: () => void;
}

let counter = 0;

export const useActivity = create<ActivityState>()((set, get) => ({
  entries: storage.getJSON<ActivityEntry[]>(KEYS.activity) ?? [],
  add: (e) => {
    if (e.dedupeKey && get().entries.some((x) => x.dedupeKey === e.dedupeKey)) return false;
    const entry: ActivityEntry = { ...e, id: `${Date.now().toString(36)}-${(counter++).toString(36)}` };
    const entries = [entry, ...get().entries].slice(0, MAX);
    set({ entries });
    storage.setJSON(KEYS.activity, entries);
    return true;
  },
  update: (id, patch) => {
    const entries = get().entries.map((x) => (x.id === id ? { ...x, ...patch } : x));
    set({ entries });
    storage.setJSON(KEYS.activity, entries);
  },
  clear: () => {
    set({ entries: [] });
    storage.remove(KEYS.activity);
  },
}));
