import type { Profile } from '@vighnaway/contracts';
import { create } from 'zustand';
import { useSettings } from '@/stores/settings';

/**
 * Re-planning on the real 23,000-edge graph is heavy and runs on the JS thread, which also draws every screen. So
 * while a screen that does not show the map is in front (Settings, Activity, Account, How it decides), planning is
 * paused: a change made there (a different travel profile, a new incident) is remembered and the plan is made once,
 * when the map comes back. The map screens keep drawing with the profile they had, so they do not rebuild a graph
 * behind the Settings screen either.
 */
interface PlanGate {
  paused: boolean;
  /** The profile the map screens keep using while paused. */
  frozen: Profile | null;
  setPaused: (paused: boolean) => void;
}

export const usePlanGate = create<PlanGate>()((set) => ({
  paused: false,
  frozen: null,
  setPaused: (paused) => set({ paused, frozen: paused ? useSettings.getState().profile : null }),
}));

/** The travel profile the map screens plan and draw with: the chosen one, unless planning is paused. */
export function useActiveProfile(): Profile {
  const profile = useSettings((s) => s.profile);
  const frozen = usePlanGate((s) => s.frozen);
  return frozen ?? profile;
}
