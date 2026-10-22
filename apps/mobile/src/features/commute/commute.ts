import type { PlanResult, Profile } from '@vighnaway/contracts';
import { create } from 'zustand';
import { KEYS, storage } from '@/lib/storage';

/**
 * Commute watch (P2-7). The traveller saves a trip and its usual route; from then on the app tells them, with a
 * local notification, only when the recommendation for that same trip differs from the usual route. It runs when
 * the app re-plans (an incident arrives, the app is opened): running while the app is closed needs a native
 * background task and a device, which is blocked (P0-3, docs/TASKS.md P2-7.b).
 */
export interface SavedCommute {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  profile: Profile;
  /** The route this commute normally takes: the usual fastest route when it was saved. */
  usualRouteId: string;
  usualName: string;
  /** The recommended route that was last announced, so the same difference is never announced twice. */
  lastAlertRouteId: string | null;
}

export interface CommuteTrip {
  originId: string;
  destinationId: string;
  profile: Profile;
}

export interface CommuteAlert {
  routeId: string;
  routeName: string;
  usualName: string;
  destinationName: string;
}

const same = (c: SavedCommute, t: CommuteTrip) => c.originId === t.originId && c.destinationId === t.destinationId && c.profile === t.profile;

/** What to tell the traveller about this plan, or null: not their commute, on the usual route, or already announced. */
export function commuteAlertFor(saved: SavedCommute | null, trip: CommuteTrip, plan: PlanResult): CommuteAlert | null {
  if (!saved || !same(saved, trip) || plan.noViableRoute) return null;
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  if (!rec || rec.routeId === saved.usualRouteId) return null;
  if (saved.lastAlertRouteId === rec.routeId) return null;
  return { routeId: rec.routeId, routeName: rec.name, usualName: saved.usualName, destinationName: saved.destinationName };
}

interface CommuteState {
  saved: SavedCommute | null;
  save: (c: Omit<SavedCommute, 'lastAlertRouteId'>) => void;
  clear: () => void;
  markAlerted: (routeId: string | null) => void;
}

export const useCommute = create<CommuteState>()((set, get) => ({
  saved: storage.getJSON<SavedCommute>(KEYS.commute) ?? null,
  save: (c) => {
    const saved = { ...c, lastAlertRouteId: null };
    set({ saved });
    storage.setJSON(KEYS.commute, saved);
  },
  clear: () => {
    set({ saved: null });
    storage.remove(KEYS.commute);
  },
  markAlerted: (routeId) => {
    const cur = get().saved;
    if (!cur) return;
    const saved = { ...cur, lastAlertRouteId: routeId };
    set({ saved });
    storage.setJSON(KEYS.commute, saved);
  },
}));
