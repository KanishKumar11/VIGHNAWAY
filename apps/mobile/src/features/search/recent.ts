import { create } from 'zustand';
import type { LatLng } from '@vighnaway/contracts';
import { KEYS, storage } from '@/lib/storage';
import type { SearchKind } from './gazetteer';

/** A place the traveller picked before, kept on the phone only. */
export interface RecentPlace {
  id: string;
  name: string;
  subtitle: string;
  kind: SearchKind;
  point: LatLng;
}

export const RECENT_MAX = 6;

interface RecentState {
  places: RecentPlace[];
  /** Newest first; the same place is moved to the top, never repeated. */
  remember: (p: RecentPlace) => void;
  clear: () => void;
}

const valid = (p: unknown): p is RecentPlace => {
  const r = p as Partial<RecentPlace> | null;
  return !!r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.point?.lat === 'number' && typeof r.point?.lng === 'number';
};

export const useRecentPlaces = create<RecentState>()((set, get) => ({
  places: (storage.getJSON<unknown[]>(KEYS.recentPlaces) ?? []).filter(valid).slice(0, RECENT_MAX),
  remember: (p) => {
    const places = [p, ...get().places.filter((x) => x.id !== p.id)].slice(0, RECENT_MAX);
    set({ places });
    storage.setJSON(KEYS.recentPlaces, places);
  },
  clear: () => {
    set({ places: [] });
    storage.remove(KEYS.recentPlaces);
  },
}));
