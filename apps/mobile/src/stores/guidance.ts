import { create } from 'zustand';
import type { AccessLeg } from '@/features/guidance/localRoads';
import type { GuidePath, GuideProgress } from '@/features/guidance/guide';

export type AccessStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The stretches of local road between the traveller's start or destination and the road network the
 * engine plans on, and the turn-by-turn guidance along the whole trip. Display and guidance only: the
 * engine still ranks the routes; the legs only say where on the network the trip joins it.
 */
interface GuidanceState {
  /** profile|origin|destination the legs were found for; legs for any other trip are ignored. */
  key: string | null;
  status: AccessStatus;
  from: AccessLeg | null;
  to: AccessLeg | null;
  path: GuidePath | null;
  progress: GuideProgress | null;
  setLegs: (key: string, from: AccessLeg | null, to: AccessLeg | null) => void;
  setStatus: (status: AccessStatus, key?: string | null) => void;
  setPath: (path: GuidePath | null) => void;
  setProgress: (progress: GuideProgress | null) => void;
  reset: () => void;
}

export const useGuidance = create<GuidanceState>()((set) => ({
  key: null,
  status: 'idle',
  from: null,
  to: null,
  path: null,
  progress: null,
  setLegs: (key, from, to) => set({ key, from, to, status: 'ready' }),
  setStatus: (status, key) => set(key === undefined ? { status } : { status, key }),
  setPath: (path) => set({ path }),
  setProgress: (progress) => set({ progress }),
  reset: () => set({ key: null, status: 'idle', from: null, to: null, path: null, progress: null }),
}));

/** The legs that belong to the trip with this key (stale ones are never used). */
export function legsFor(key: string): { from: AccessLeg | null; to: AccessLeg | null } {
  const s = useGuidance.getState();
  return s.key === key && s.status === 'ready' ? { from: s.from, to: s.to } : { from: null, to: null };
}
