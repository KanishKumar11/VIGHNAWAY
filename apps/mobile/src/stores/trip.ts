import { create } from 'zustand';
import type { PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import type { VehicleState } from '@vighnaway/engine';
import { KEYS, storage } from '@/lib/storage';
import { useScenario } from './scenario';

export type TripMode = 'planning' | 'en_route' | 'arrived';

export interface Banner {
  id: number;
  tone: 'change' | 'danger';
  title: string;
  message: string;
  tradeOff: string;
  atS: number;
  /** The incident that triggered the change, shown with its evidence in the banner. */
  incidentId?: string | null;
}

/** The route-change moment (DESIGN.md section 6), driven by the map and the sheet. */
export interface Transition {
  id: number;
  fromRoute: RouteEvaluation | null;
  toRouteId: string | null;
  blockedEdgeId: string | null;
  phase: 'flash' | 'reveal' | 'done';
  /** 0..1 progress of the reveal phase. */
  progress: number;
  /** Frozen mid-animation for the hero-screen fixture. */
  frozen: boolean;
}

export interface HistoryEntry {
  atS: number;
  routeId: string | null;
  name: string | null;
}

interface TripState {
  originId: string;
  destinationId: string;
  mode: TripMode;
  plan: PlanResult | null;
  /**
   * The route the traveller tapped (on the map or in the list) instead of the recommended one; null
   * means the recommended route. The engine still labels and explains every route; this only says
   * which one the trip will follow. Cleared when the trip or the plan's context changes.
   */
  selectedRouteId: string | null;
  selectRoute: (routeId: string | null) => void;
  /** profile|destination|origin the current plan was made for. */
  planContext: string | null;
  evaluating: boolean;
  vehicle: VehicleState | null;
  /** Simulation time the vehicle was last advanced to. */
  vehicleAtS: number | null;
  history: HistoryEntry[];
  banner: Banner | null;
  transition: Transition | null;
  /** Live mode only: whether the trip follows the device location, or location was refused. */
  liveLocation: 'idle' | 'following' | 'denied';
  setLiveLocation: (v: 'idle' | 'following' | 'denied') => void;
  /** How far the chosen start and destination are from the road network the route uses (metres). */
  access: { fromM: number; toM: number } | null;
  setAccess: (a: { fromM: number; toM: number } | null) => void;
  setOrigin: (id: string) => void;
  setDestination: (id: string) => void;
  setEvaluating: (v: boolean) => void;
  setPlan: (plan: PlanResult, context: string, vehicle?: VehicleState | null) => void;
  startTrip: (vehicle: VehicleState, atS: number) => void;
  setVehicle: (vehicle: VehicleState, atS: number) => void;
  arrive: () => void;
  endTrip: () => void;
  resetTrip: () => void;
  pushHistory: (h: HistoryEntry) => void;
  showBanner: (b: Omit<Banner, 'id'>) => void;
  dismissBanner: () => void;
  setTransition: (t: Transition | null) => void;
  patchTransition: (id: number, patch: Partial<Transition>) => void;
}

let bannerId = 1;

const savedPlan = storage.getJSON<{ plan: PlanResult; context: string }>(KEYS.lastPlan);

// The demo trip of whichever scenario is active (simulated or live places).
const demoTrip = () => useScenario.getState().scenario.demoTrip;

export const useTrip = create<TripState>()((set, get) => ({
  originId: demoTrip().originId,
  destinationId: demoTrip().destinationId,
  mode: 'planning',
  plan: savedPlan?.plan ?? null,
  selectedRouteId: null,
  selectRoute: (selectedRouteId) => set({ selectedRouteId }),
  planContext: savedPlan?.context ?? null,
  evaluating: false,
  vehicle: null,
  vehicleAtS: null,
  history: [],
  banner: null,
  transition: null,
  liveLocation: 'idle',
  setLiveLocation: (liveLocation) => set({ liveLocation }),
  access: null,
  setAccess: (access) => set({ access }),
  setOrigin: (originId) => set({ originId }),
  setDestination: (destinationId) => set({ destinationId }),
  setEvaluating: (evaluating) => set({ evaluating }),
  setPlan: (plan, planContext, vehicle) => {
    // A choice survives a re-plan of the same trip while that route still exists; a new trip clears it.
    const keep = get().planContext === planContext && plan.routes.some((r) => r.routeId === get().selectedRouteId);
    const selectedRouteId = keep ? get().selectedRouteId : null;
    set(vehicle === undefined ? { plan, planContext, selectedRouteId } : { plan, planContext, vehicle, selectedRouteId });
    // The saved plan is only restored at launch on the Andheri map, so a corridor plan is not kept.
    if (useScenario.getState().region === 'andheri') storage.setJSON(KEYS.lastPlan, { plan, context: planContext });
  },
  startTrip: (vehicle, atS) => set({ mode: 'en_route', vehicle, vehicleAtS: atS, selectedRouteId: null }),
  setVehicle: (vehicle, vehicleAtS) => set({ vehicle, vehicleAtS }),
  arrive: () => set({ mode: 'arrived' }),
  endTrip: () => set({ mode: 'planning', vehicle: null, vehicleAtS: null, banner: null, transition: null, liveLocation: 'idle' }),
  resetTrip: () =>
    set({
      mode: 'planning',
      vehicle: null,
      vehicleAtS: null,
      banner: null,
      transition: null,
      liveLocation: 'idle',
      history: [],
      originId: demoTrip().originId,
      destinationId: demoTrip().destinationId,
      plan: null,
      selectedRouteId: null,
      planContext: null,
      access: null,
    }),
  pushHistory: (h) => set({ history: [...get().history, h].slice(-50) }),
  showBanner: (b) => set({ banner: { ...b, id: bannerId++ } }),
  dismissBanner: () => set({ banner: null }),
  setTransition: (transition) => set({ transition }),
  patchTransition: (id, patch) => {
    const t = get().transition;
    if (t && t.id === id) set({ transition: { ...t, ...patch } });
  },
}));

export const recommendedRoute = (plan: PlanResult | null): RouteEvaluation | null =>
  plan?.routes.find((r) => r.routeId === plan.recommendedRouteId) ?? null;

/** The route the trip uses: the one the traveller chose, else the recommended one. */
export const activeRoute = (plan: PlanResult | null, selectedRouteId: string | null): RouteEvaluation | null =>
  (selectedRouteId ? plan?.routes.find((r) => r.routeId === selectedRouteId && r.role !== 'blocked') : null) ?? recommendedRoute(plan);
