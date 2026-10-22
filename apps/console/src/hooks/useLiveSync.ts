'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  IncidentUpsertedSchema,
  LIVE_NAMESPACE,
  SimResetSchema,
  SimStateSchema,
  SimTickSchema,
  SOCKET_EVENTS,
  TripPositionSchema,
} from '@vighnaway/contracts';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { useScenarioStore } from '@/stores/scenario';
import { resyncSinceSeq } from '@/lib/sync';
import { useLiveStore } from '@/stores/live';

const RETRY_MS = 3000;

interface JoinAck {
  ok: boolean;
  seq: number;
  runId: string;
}
const isJoinAck = (a: unknown): a is JoinAck =>
  !!a && typeof a === 'object' && typeof (a as JoinAck).runId === 'string' && typeof (a as JoinAck).seq === 'number';

/**
 * Socket join and the resync rule (docs/CONTRACTS.md). On every connect and reconnect: emit join,
 * then GET incidents?sinceSeq=<lastSeq> before trusting the stream; apply incident.upserted only
 * when seq > lastSeq; resync on a gap; on sim.reset clear and resync with no sinceSeq.
 */
export function useLiveSync(): void {
  const scenarioId = useScenarioStore((s) => s.id);
  const ready = useScenarioStore((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    const SCENARIO_ID = scenarioId;
    const store = useLiveStore;
    store.getState().switchScenario(SCENARIO_ID);
    let disposed = false;
    let resyncing = false;
    let again = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const abort = new AbortController();

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void resync();
      }, RETRY_MS);
    };

    async function resync(): Promise<void> {
      if (disposed) return;
      if (resyncing) {
        again = true;
        return;
      }
      resyncing = true;
      try {
        do {
          again = false;
          const since = resyncSinceSeq(store.getState().sync);
          const resp = await api.incidents(SCENARIO_ID, since, { signal: abort.signal });
          if (disposed) return;
          store.getState().applySnapshot(resp);
          store.getState().setApiReachable(true);
        } while (again && !disposed);
        if (socket.connected) store.getState().setConnection('live');
      } catch (e) {
        if (disposed || (e as Error)?.name === 'AbortError') return;
        store.getState().setApiReachable(false);
        scheduleRetry();
      } finally {
        resyncing = false;
      }
    }

    async function loadScenario(): Promise<void> {
      try {
        const resp = await api.scenario(SCENARIO_ID, { signal: abort.signal });
        if (disposed) return;
        store.getState().setServerGraphVersion(resp.scenario.graphVersion);
        store.getState().setSim(resp.sim);
      } catch {
        /* reported through resync */
      }
    }

    const socket: Socket = io(`${API_URL}${LIVE_NAMESPACE}`, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      store.getState().setConnection('syncing');
      store.getState().setApiReachable(true);
      socket.timeout(5000).emit(SOCKET_EVENTS.join, { scenarioId: SCENARIO_ID }, (err: unknown, ack: unknown) => {
        if (disposed) return;
        if (!err && isJoinAck(ack)) store.getState().applyJoinAck(ack);
        void resync();
        void loadScenario();
      });
    });
    socket.on('disconnect', () => {
      if (!disposed) store.getState().setConnection('reconnecting');
    });
    socket.on('connect_error', () => {
      if (disposed) return;
      store.getState().setConnection('reconnecting');
      store.getState().setApiReachable(false);
    });

    socket.on(SOCKET_EVENTS.incidentUpserted, (raw: unknown) => {
      const p = IncidentUpsertedSchema.safeParse(raw);
      if (!p.success) return;
      const outcome = store.getState().applyUpserted(p.data);
      if (outcome === 'gap') void resync();
    });
    socket.on(SOCKET_EVENTS.simState, (raw: unknown) => {
      const p = SimStateSchema.safeParse(raw);
      if (p.success) store.getState().setSim(p.data);
    });
    socket.on(SOCKET_EVENTS.simTick, (raw: unknown) => {
      const p = SimTickSchema.safeParse(raw);
      if (!p.success || p.data.scenarioId !== SCENARIO_ID) return;
      store.getState().setSimTime(p.data.simTimeS);
    });
    socket.on(SOCKET_EVENTS.simReset, (raw: unknown) => {
      const p = SimResetSchema.safeParse(raw);
      if (!p.success) return;
      store.getState().applyReset(p.data);
      void resync();
      void loadScenario();
    });
    socket.on(SOCKET_EVENTS.tripPosition, (raw: unknown) => {
      const p = TripPositionSchema.safeParse(raw);
      if (!p.success || p.data.scenarioId !== SCENARIO_ID) return;
      store.getState().setTripPosition(p.data);
    });

    // REST first, so the queue fills even if websockets are blocked on the network.
    void resync();
    void loadScenario();

    return () => {
      disposed = true;
      abort.abort();
      if (retryTimer) clearTimeout(retryTimer);
      socket.removeAllListeners();
      socket.close();
    };
  }, [scenarioId, ready]);
}

/** Which scenarios the API serves (the switcher hides live mode until the API has it). */
export function useScenarioList(): void {
  useEffect(() => {
    const abort = new AbortController();
    api
      .scenarios({ signal: abort.signal })
      .then((r) => useScenarioStore.getState().setAvailable(r.scenarios.map((x) => x.id)))
      .catch(() => {
        if (!abort.signal.aborted) useScenarioStore.getState().setAvailable(null);
      });
    return () => abort.abort();
  }, []);
}
