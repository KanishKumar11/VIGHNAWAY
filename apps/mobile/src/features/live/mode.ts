import { AppState } from 'react-native';
import { t } from '@/i18n/en';
import { api, ApiRequestError } from '@/lib/api';
import { KEYS, storage } from '@/lib/storage';
import { schedulePlan } from '@/features/trip/planner';
import { stopFollowing } from '@/features/trip/deviceTrip';
import { useActivity } from '@/stores/activity';
import { useFeed } from '@/stores/feed';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings, type DataMode } from '@/stores/settings';
import { useSim, wallSimTimeS } from '@/stores/sim';
import { useTrip } from '@/stores/trip';

/** True in live mode (real Andheri data; nothing is labelled Simulated, no simulated vehicle). */
export const isLiveMode = (): boolean => useSettings.getState().dataMode === 'live';

/** Live scenario id the app expects on the server (bundled copy in @vighnaway/scenario-data). */
export const LIVE_SCENARIO_MODE = 'live' as const;

/**
 * Switches between the simulated demo and live Andheri data. The two scenarios have their own
 * incidents, seq space, clock and place ids, so everything scenario-bound starts fresh; liveSync
 * rejoins the socket room for the new scenario and resyncs.
 */
export function switchDataMode(mode: DataMode): void {
  const settings = useSettings.getState();
  if (settings.dataMode === mode) return;
  stopFollowing();
  settings.setDataMode(mode);
  useScenario.getState().selectMode(mode);
  const scenario = useScenario.getState().scenario;
  useIncidents.getState().clearCache();
  useSim.getState().resetForScenario(mode === 'live', scenario.clockStartsAt);
  useTrip.getState().resetTrip();
  storage.remove(KEYS.lastPlan);
  useFeed.getState().clear();
  useActivity.getState().add({
    atS: useSim.getState().simTimeS,
    kind: 'trip',
    text: t(mode === 'live' ? 'activityModeLive' : 'activityModeSimulated'),
  });
  schedulePlan({ showEvaluating: true, delayMs: 0 });
  if (mode === 'live') void pollFeed();
}

/** GET /scenarios/:id/feed; a 404 means this server has no live feed (or no live scenario) yet. */
export async function pollFeed(): Promise<void> {
  if (!isLiveMode()) return;
  const id = useScenario.getState().scenario.id;
  try {
    const status = await api.feed(useSettings.getState().apiUrl, id);
    if (isLiveMode() && useScenario.getState().scenario.id === id) useFeed.getState().setStatus(status);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status >= 400 && e.status < 500) useFeed.getState().setUnavailable();
    // Network failures keep the last status; the connection pill reports the outage.
  }
}

/**
 * Live mode housekeeping, started once from the root layout: the clock follows the wall clock
 * between server ticks, and the feed status is polled once a minute while the app is active.
 */
export function startLiveMode(): () => void {
  const tick = () => {
    if (!isLiveMode() || useSettings.getState().fixtureMode) return;
    useSim.getState().setWallTime(wallSimTimeS(useScenario.getState().scenario.clockStartsAt));
  };
  tick();
  void pollFeed();
  const clock = setInterval(tick, 15_000);
  const feed = setInterval(() => {
    if (AppState.currentState === 'active') void pollFeed();
  }, 60_000);
  return () => {
    clearInterval(clock);
    clearInterval(feed);
  };
}
