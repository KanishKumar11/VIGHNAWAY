import { create } from 'zustand';
import type { FeedStatus } from '@vighnaway/contracts';

/**
 * Live traffic feed status (live mode only), from GET /scenarios/:id/feed. 'unavailable' when the
 * server has no feed endpoint or no live scenario yet (404), so the UI can say "Live traffic off".
 */
interface FeedState {
  status: FeedStatus | null;
  availability: 'unknown' | 'available' | 'unavailable';
  /** Live mode: the server answered 404 for the live scenario (not deployed there yet). */
  scenarioMissing: boolean;
  setScenarioMissing: (v: boolean) => void;
  setStatus: (s: FeedStatus) => void;
  setUnavailable: () => void;
  clear: () => void;
}

export const useFeed = create<FeedState>()((set) => ({
  status: null,
  availability: 'unknown',
  scenarioMissing: false,
  setScenarioMissing: (scenarioMissing) => set({ scenarioMissing }),
  setStatus: (status) => set({ status, availability: 'available' }),
  setUnavailable: () => set({ status: null, availability: 'unavailable' }),
  clear: () => set({ status: null, availability: 'unknown', scenarioMissing: false }),
}));
