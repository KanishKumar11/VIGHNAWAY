import { create } from 'zustand';
import type { Incident, IncidentsResponse, IncidentUpserted, ObservationPayload, SimReset, SimState, TripPosition } from '@vighnaway/contracts';
import {
  applyJoinAck,
  applyReset,
  applySnapshot,
  applyUpserted,
  initialSyncState,
  type SyncState,
  type UpsertOutcome,
} from '@/lib/sync';
import { SCENARIO_ID } from '@/lib/scenarios';

export type ConnectionState = 'connecting' | 'syncing' | 'live' | 'reconnecting';

export interface TickerItem {
  key: string;
  atS: number;
  text: string;
}

export const TICKER_LENGTH = 5;

export interface LiveState {
  sync: SyncState;
  connection: ConnectionState;
  /** null until the first attempt finishes. */
  apiReachable: boolean | null;
  sim: SimState | null;
  /** Simulation seconds from sim.tick / sim.state; the console never reads a wall clock for routing. */
  simTimeS: number;
  tripPosition: TripPosition | null;
  /** Increments on every sim.reset or run change, so dependants rebuild. */
  resetCount: number;
  serverGraphVersion: string | null;
  ticker: TickerItem[];
  /** Latest report per flood-prone edge from the server, Road clear included (from the last snapshot). */
  observations: ObservationPayload[];
  /** Optimistic operator actions, shown until confirmed or rolled back. Never used for routing. */
  optimistic: Record<string, Incident>;
  /** Server responses to operator actions, shown until the stream delivers that seq. */
  confirmed: Record<string, Incident>;
  /** Pulse counters: the incident card and its marker pulse together when this changes. */
  pulses: Record<string, number>;

  applySnapshot(resp: IncidentsResponse): void;
  applyUpserted(ev: IncidentUpserted): UpsertOutcome;
  applyReset(ev: SimReset): void;
  applyJoinAck(ack: { runId: string; seq: number }): boolean;
  setSim(sim: SimState): void;
  setSimTime(simTimeS: number): void;
  setTripPosition(pos: TripPosition | null): void;
  setConnection(c: ConnectionState): void;
  setApiReachable(ok: boolean): void;
  setServerGraphVersion(v: string | null): void;
  addTicker(item: TickerItem): void;
  setOptimistic(incident: Incident): void;
  rollback(id: string): void;
  confirm(incident: Incident): void;
  pulse(id: string): void;
  /** Start over on another scenario (simulated demo or live mode). */
  switchScenario(scenarioId: string): void;
}

const pruneConfirmed = (confirmed: Record<string, Incident>, incidents: Record<string, Incident>) => {
  let changed = false;
  const out: Record<string, Incident> = {};
  for (const [id, inc] of Object.entries(confirmed)) {
    const cur = incidents[id];
    if (cur && cur.seq >= inc.seq) changed = true;
    else out[id] = inc;
  }
  return changed ? out : confirmed;
};

const newlyVerified = (before: Record<string, Incident>, after: Record<string, Incident>): string[] =>
  Object.values(after)
    .filter((i) => i.status === 'verified' && before[i.id]?.status !== 'verified' && before[i.id] !== undefined)
    .map((i) => i.id);

const bump = (pulses: Record<string, number>, ids: string[]) => {
  if (!ids.length) return pulses;
  const out = { ...pulses };
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
};

export const createLiveStore = (scenarioId: string = SCENARIO_ID) =>
  create<LiveState>()((set, get) => ({
    sync: initialSyncState(scenarioId),
    connection: 'connecting',
    apiReachable: null,
    sim: null,
    simTimeS: 0,
    tripPosition: null,
    resetCount: 0,
    serverGraphVersion: null,
    ticker: [], observations: [],
    optimistic: {},
    confirmed: {},
    pulses: {},

    applySnapshot(resp) {
      const s = get();
      const runChanged = s.sync.runId !== null && resp.runId !== s.sync.runId;
      const sync = applySnapshot(s.sync, resp);
      if (sync === s.sync) return;
      set({
        sync,
        simTimeS: Math.max(runChanged ? 0 : s.simTimeS, resp.simTimeS),
        confirmed: pruneConfirmed(s.confirmed, sync.incidents),
        pulses: bump(s.pulses, newlyVerified(s.sync.incidents, sync.incidents)),
        ...(resp.observations ? { observations: resp.observations } : {}),
        ...(runChanged ? { resetCount: s.resetCount + 1, tripPosition: null, ticker: [], simTimeS: resp.simTimeS } : {}),
      });
    },

    applyUpserted(ev) {
      const s = get();
      const { state, outcome } = applyUpserted(s.sync, ev);
      if (outcome !== 'applied') return outcome;
      const optimistic = { ...s.optimistic };
      delete optimistic[ev.incident.id];
      set({
        sync: state,
        confirmed: pruneConfirmed(s.confirmed, state.incidents),
        optimistic,
        pulses: bump(s.pulses, newlyVerified(s.sync.incidents, state.incidents)),
        ticker: [{ key: `seq-${ev.seq}`, atS: ev.incident.updatedAtS, text: ev.summary }, ...s.ticker].slice(0, TICKER_LENGTH),
      });
      return outcome;
    },

    applyReset(ev) {
      const s = get();
      if (ev.scenarioId !== s.sync.scenarioId) return;
      set({
        sync: applyReset(s.sync, ev),
        simTimeS: 0,
        tripPosition: null,
        resetCount: s.resetCount + 1,
        ticker: [], observations: [],
        optimistic: {},
        confirmed: {},
      });
    },

    applyJoinAck(ack) {
      const s = get();
      const { state, reset } = applyJoinAck(s.sync, ack);
      if (reset) {
        set({ sync: state, resetCount: s.resetCount + 1, tripPosition: null, ticker: [], observations: [], optimistic: {}, confirmed: {}, simTimeS: 0 });
      }
      return reset;
    },

    setSim(sim) {
      if (sim.scenarioId !== get().sync.scenarioId) return;
      set({ sim, simTimeS: sim.simTimeS });
    },
    setSimTime(simTimeS) {
      set({ simTimeS });
    },
    setTripPosition(tripPosition) {
      set({ tripPosition });
    },
    setConnection(connection) {
      set({ connection });
    },
    setApiReachable(apiReachable) {
      set({ apiReachable });
    },
    setServerGraphVersion(serverGraphVersion) {
      set({ serverGraphVersion });
    },
    addTicker(item) {
      const s = get();
      if (s.ticker.some((t) => t.key === item.key)) return;
      set({ ticker: [item, ...s.ticker].slice(0, TICKER_LENGTH) });
    },
    setOptimistic(incident) {
      set({ optimistic: { ...get().optimistic, [incident.id]: incident } });
    },
    rollback(id) {
      const optimistic = { ...get().optimistic };
      delete optimistic[id];
      set({ optimistic });
    },
    confirm(incident) {
      const s = get();
      const optimistic = { ...s.optimistic };
      delete optimistic[incident.id];
      const cur = s.sync.incidents[incident.id];
      const confirmed = cur && cur.seq >= incident.seq ? s.confirmed : { ...s.confirmed, [incident.id]: incident };
      set({ optimistic, confirmed });
    },
    pulse(id) {
      set({ pulses: bump(get().pulses, [id]) });
    },
    switchScenario(scenarioId) {
      const s = get();
      if (s.sync.scenarioId === scenarioId) return;
      set({
        sync: initialSyncState(scenarioId),
        sim: null,
        simTimeS: 0,
        tripPosition: null,
        resetCount: s.resetCount + 1,
        apiReachable: null,
        serverGraphVersion: null,
        ticker: [], observations: [],
        optimistic: {},
        confirmed: {},
        pulses: {},
      });
    },
  }));

export const useLiveStore = createLiveStore();

/** What the queue and markers show: optimistic, then confirmed, then the synced incident. */
export function displayIncidents(s: Pick<LiveState, 'sync' | 'optimistic' | 'confirmed'>): Incident[] {
  const ids = new Set([...Object.keys(s.sync.incidents), ...Object.keys(s.confirmed)]);
  const out: Incident[] = [];
  for (const id of ids) {
    const base = s.sync.incidents[id];
    const conf = s.confirmed[id];
    const shown = s.optimistic[id] ?? (conf && (!base || conf.seq > base.seq) ? conf : base);
    if (shown) out.push(shown);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
