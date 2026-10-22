import { create } from 'zustand';
import type { TripState } from '@/lib/demoTrip';

export interface TripStore {
  trip: TripState | null;
  /** Wall-clock milliseconds the last engine run took (display only, /debug style). */
  lastRunMs: number | null;
  set(trip: TripState, ms: number | null): void;
}

export const useTripStore = create<TripStore>()((set) => ({
  trip: null,
  lastRunMs: null,
  set(trip, ms) {
    set(ms === null ? { trip } : { trip, lastRunMs: ms });
  },
}));
