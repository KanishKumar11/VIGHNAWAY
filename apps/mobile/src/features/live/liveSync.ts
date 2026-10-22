import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import {
  IncidentUpsertedSchema,
  LIVE_NAMESPACE,
  REPORT_TYPE_LABEL,
  SOCKET_EVENTS,
  SimResetSchema,
  SimStateSchema,
  SimTickSchema,
  TripPositionSchema,
  type Incident,
  type IncidentUpserted,
  type TripPosition,
} from '@vighnaway/contracts';
import { vehiclePosition } from '@vighnaway/engine';
import { andheriScenario } from '@vighnaway/scenario-data';
import { t } from '@/i18n/en';
import { evidenceText } from '@/i18n/engineText';
import { sendPhoto } from '@/features/report/submit';
import { api, ApiRequestError } from '@/lib/api';
import { getGraph } from '@/lib/engine';
import { haptic } from '@/lib/feedback';
import { sinceSeqFor } from '@/lib/sync';
import { useActivity } from '@/stores/activity';
import { authToken } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { useFeed } from '@/stores/feed';
import { useIncidents } from '@/stores/incidents';
import { usePendingReports } from '@/stores/reports';
import { isCustomPlaceId, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useToast } from '@/stores/toast';
import { recommendedRoute, useTrip } from '@/stores/trip';

/**
 * One socket.io-client instance (websocket transport) per API URL. It connects while the app is
 * active (and stays connected in the background during a trip, so a route change can still raise
 * a local notification), and follows the resync rule on every connect:
 * join, then GET /incidents?sinceSeq=<lastSeq> before trusting the stream.
 */
let socket: Socket | null = null;
let socketUrl: string | null = null;
let resyncing = false;
let resyncAgain = false;
let lastPositionEmit = 0;

const scenarioId = () => useScenario.getState().scenario.id;
const apiUrl = () => useSettings.getState().apiUrl;

/**
 * A live feed refresh arrives as dozens of upserts at once. Each store update re-renders the map
 * and the sheet, so a burst is applied together: one update, one re-render, one re-plan.
 */
const UPSERT_BATCH_MS = 250;
let upsertQueue: IncidentUpserted[] = [];
let upsertTimer: ReturnType<typeof setTimeout> | null = null;

function flushUpserts(): void {
  upsertTimer = null;
  const batch = upsertQueue;
  upsertQueue = [];
  if (!batch.length) return;
  const byId = useIncidents.getState().byId;
  const before = batch.map((e) => byId[e.incident.id] ?? null);
  const results = useIncidents.getState().applyUpserts(batch, scenarioId());
  results.forEach((r, i) => {
    if (r.kind === 'applied') noteIncidentChange(before[i] ?? null, batch[i]!.incident, false, i > 0);
  });
  if (results.some((r) => r.kind === 'resync')) void resync();
}

export function getSocket(): Socket | null {
  return socket;
}

function shouldBeConnected(appState: AppStateStatus | string | null | undefined): boolean {
  if (useSettings.getState().fixtureMode) return false;
  if (useConnection.getState().net === 'offline') return false;
  return appState === 'active' || useTrip.getState().mode === 'en_route';
}

function createSocket(url: string): Socket {
  const s = io(`${url}${LIVE_NAMESPACE}`, {
    // Start on plain HTTPS long-polling and upgrade to WebSocket when the network allows it: some
    // phone networks and proxies reject WebSocket upgrades while ordinary HTTPS works.
    transports: ['polling', 'websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 8000,
  });
  s.on('connect', () => {
    useConnection.getState().setSocket('connecting');
    void onConnected(s);
  });
  s.on('disconnect', () => {
    if (useConnection.getState().socket !== 'unreachable') useConnection.getState().setSocket('connecting');
  });
  s.on('connect_error', (err: Error) => {
    if (__DEV__) console.warn('[live] socket connect_error:', err.message, JSON.stringify((err as { description?: unknown }).description ?? null));
    useConnection.getState().setSocket('unreachable', err.message);
  });
  s.on(SOCKET_EVENTS.incidentUpserted, (raw: unknown) => {
    const parsed = IncidentUpsertedSchema.safeParse(raw);
    if (!parsed.success) return;
    upsertQueue.push(parsed.data);
    upsertTimer ??= setTimeout(flushUpserts, UPSERT_BATCH_MS);
  });
  s.on(SOCKET_EVENTS.simState, (raw: unknown) => {
    const parsed = SimStateSchema.safeParse(raw);
    if (!parsed.success || parsed.data.scenarioId !== scenarioId()) return;
    const knownRun = useIncidents.getState().runId;
    if (knownRun !== null && knownRun !== parsed.data.runId) handleReset();
    useSim.getState().applyState(parsed.data);
  });
  s.on(SOCKET_EVENTS.simTick, (raw: unknown) => {
    const parsed = SimTickSchema.safeParse(raw);
    if (!parsed.success || parsed.data.scenarioId !== scenarioId()) return;
    useSim.getState().applyTick(parsed.data.simTimeS, parsed.data.runId);
  });
  s.on(SOCKET_EVENTS.simReset, (raw: unknown) => {
    const parsed = SimResetSchema.safeParse(raw);
    if (!parsed.success || parsed.data.scenarioId !== scenarioId()) return;
    handleReset();
  });
  return s;
}

function handleReset(): void {
  // Queued events belong to the old run.
  upsertQueue = [];
  useIncidents.getState().reset();
  useTrip.getState().resetTrip();
  void resync();
}

async function onConnected(s: Socket): Promise<void> {
  try {
    await s.timeout(5000).emitWithAck(SOCKET_EVENTS.join, { scenarioId: scenarioId() });
  } catch {
    // The ack is informative only; the REST resync below is what we trust.
  }
  await resync();
}

/** GET incidents since lastSeq (full when unknown), then the scenario and sim state. */
export async function resync(): Promise<void> {
  if (useSettings.getState().fixtureMode) return;
  if (resyncing) {
    resyncAgain = true;
    return;
  }
  resyncing = true;
  const url = apiUrl();
  try {
    const before = useIncidents.getState().byId;
    const res = await api.incidents(url, scenarioId(), sinceSeqFor(useIncidents.getState()));
    if (url !== apiUrl()) return;
    useIncidents.getState().applyResponse(res);
    useFeed.getState().setScenarioMissing(false);
    const after = useIncidents.getState().byId;
    for (const inc of res.incidents) if (after[inc.id] === inc) noteIncidentChange(before[inc.id] ?? null, inc, true);
    try {
      const sc = await api.scenario(url, scenarioId());
      useScenario.getState().setServerScenario(sc.scenario);
      useSim.getState().applyState(sc.sim);
    } catch {
      // Scenario is bundled; the sim clock follows sim.tick.
    }
    useConnection.getState().setSocket('live');
    void flushPendingReports();
  } catch (e) {
    // Live mode against a server without the live scenario yet: say so instead of "unreachable".
    if (e instanceof ApiRequestError && e.status === 404 && useSettings.getState().dataMode === 'live') useFeed.getState().setScenarioMissing(true);
    useConnection.getState().setSocket('unreachable', e instanceof Error ? e.message : String(e));
  } finally {
    resyncing = false;
    if (resyncAgain) {
      resyncAgain = false;
      void resync();
    }
  }
}

/** Activity entry and haptic for incidents on the current route (new ones and status upgrades). */
function noteIncidentChange(before: Incident | null, inc: Incident, quiet = false, inBurst = false): void {
  const rec = recommendedRoute(useTrip.getState().plan);
  const onRoute = rec ? inc.edgeIds.some((id) => rec.edgeIds.includes(id)) : false;
  // A live feed refresh brings dozens of far-away incidents: only ones on the route tap, and a
  // burst taps once.
  if (useSettings.getState().dataMode === 'live' && !onRoute) quiet = true;
  if (inBurst) quiet = true;
  // Evidence building up (DESIGN_VISION appendix A): a light tap when a second device corroborates,
  // a success tap when an operator verifies; one each, never repeated.
  if (!before && !quiet) haptic.light();
  else if (before && before.status !== inc.status && !quiet) {
    if (inc.status === 'corroborated') haptic.light();
    else if (inc.status === 'verified') haptic.success();
    else haptic.selection();
  }
  if (!onRoute) return;
  if (before && before.status === inc.status && before.deviceCount === inc.deviceCount) return;
  useActivity.getState().add({
    atS: inc.updatedAtS,
    kind: 'incident',
    text: evidenceText(inc),
    dedupeKey: `inc|${inc.id}|${inc.seq}`,
  });
}

/** Sends queued reports once the API is reachable again. */
export async function flushPendingReports(): Promise<void> {
  const { pending, remove } = usePendingReports.getState();
  for (const p of pending) {
    try {
      // Each report goes to the scenario it was made in (queues from before tagging: the demo).
      const res = await api.report(apiUrl(), p.scenarioId ?? andheriScenario.id, p.input, authToken());
      remove(p.localId);
      // The photo of a queued report goes up once the report is in; if it cannot, say so (the report stands).
      if (p.photo && (await sendPhoto(p.scenarioId ?? andheriScenario.id, res.receipt.reportId, p.input.deviceId, p.photo)) === 'failed') {
        useToast.getState().show(t('toastPhotoFailed'), 'warn');
      }
      const text = t('activityReportSent', { type: REPORT_TYPE_LABEL[p.input.type] });
      if (p.activityId) useActivity.getState().update(p.activityId, { kind: 'report_sent', text });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        remove(p.localId);
        const text = t('activityReportFailed', { message: e.message });
        if (p.activityId) useActivity.getState().update(p.activityId, { kind: 'report_failed', text });
        // The traveller was told it was queued: say clearly that it was not accepted.
        useToast.getState().show(text, 'warn');
        continue;
      }
      return; // still offline or rate limited: keep the queue
    }
  }
}

/** trip.position, at most once per second (display only on the console). */
function emitTripPosition(): void {
  const s = socket;
  if (!s?.connected) return;
  const now = Date.now();
  if (now - lastPositionEmit < 1000) return;
  const trip = useTrip.getState();
  if (!trip.vehicle || trip.mode === 'planning') return;
  // The console only knows the scenario's own places; a searched start or destination stays on the phone.
  if (isCustomPlaceId(trip.originId) || isCustomPlaceId(trip.destinationId)) return;
  const { graphFile, scenario } = useScenario.getState();
  const profile = useSettings.getState().profile;
  const graph = getGraph(graphFile, profile);
  const pos = vehiclePosition(graph, trip.vehicle);
  if (!pos) return;
  const payload: TripPosition = {
    scenarioId: scenario.id,
    routeId: trip.plan?.recommendedRouteId ?? '',
    coordinate: pos.point,
    headingDeg: ((pos.headingDeg % 360) + 360) % 360,
    simTimeS: useSim.getState().simTimeS,
    edgeId: pos.edgeId,
    edgeFraction: Math.max(0, Math.min(1, trip.vehicle.fraction)),
    profile,
    destinationId: trip.destinationId,
    edgeIds: trip.vehicle.edgeIds.slice(0, 5000),
    travelledEdgeCount: trip.vehicle.index,
    status: trip.mode === 'arrived' || trip.vehicle.arrived ? 'arrived' : 'en_route',
  };
  const ok = TripPositionSchema.safeParse(payload);
  if (!ok.success) return;
  lastPositionEmit = now;
  s.emit(SOCKET_EVENTS.tripPosition, ok.data);
}

function ensureSocket(): Socket {
  const url = apiUrl();
  if (socket && socketUrl === url) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socketUrl = url;
  socket = createSocket(url);
  return socket;
}

function reconcile(appState: AppStateStatus | string | null | undefined = AppState.currentState): void {
  if (shouldBeConnected(appState)) {
    const s = ensureSocket();
    if (!s.connected && !s.active) {
      useConnection.getState().setSocket('connecting');
      s.connect();
    }
  } else if (socket?.active) {
    socket.disconnect();
    useConnection.getState().setSocket('idle');
  }
}

/** Starts live sync; returns a cleanup. Called once from the root layout. */
export function startLiveSync(): () => void {
  const subs: (() => void)[] = [];
  subs.push(
    NetInfo.addEventListener((state) => {
      const net = state.isConnected === false ? 'offline' : 'online';
      const prev = useConnection.getState().net;
      useConnection.getState().setNet(net);
      if (prev !== net) reconcile();
    }),
  );
  const appSub = AppState.addEventListener('change', (st) => reconcile(st));
  subs.push(() => appSub.remove());
  subs.push(
    useSettings.subscribe((s, prev) => {
      if (s.apiUrl !== prev.apiUrl) {
        // A different server has its own seq space: start from a full fetch.
        useIncidents.getState().reset();
        useConnection.getState().setSocket('connecting');
        reconcile();
      } else if (s.dataMode !== prev.dataMode) {
        // Another scenario: rejoin its room and resync from a full fetch (mode.ts cleared the cache).
        useConnection.getState().setSocket('connecting');
        if (socket?.active) socket.disconnect();
        reconcile();
      } else if (s.fixtureMode !== prev.fixtureMode) {
        reconcile();
        if (!s.fixtureMode) void resync();
      }
    }),
  );
  subs.push(
    useTrip.subscribe((s, prev) => {
      if (s.vehicle !== prev.vehicle || s.mode !== prev.mode) emitTripPosition();
      if (s.mode !== prev.mode) reconcile();
    }),
  );
  reconcile();
  return () => {
    subs.forEach((u) => u());
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
      socketUrl = null;
    }
  };
}
