'use client';

import { useEffect, useMemo, useState } from 'react';
import { boundsOf, type Insets } from '@/lib/projection';
import { recommendedRoute } from '@/lib/demoTrip';
import { buildScene } from '@/lib/scene';
import { GRAPH_FILE, isLiveScenario } from '@/lib/scenario';
import { useActiveScenario, useScenarioStore } from '@/stores/scenario';
import { displayIncidents, useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { useTripStore } from '@/stores/trip';
import { useLiveSync, useScenarioList } from '@/hooks/useLiveSync';
import { useFeedStatus } from '@/hooks/useFeedStatus';
import { tripEnv, useDemoTripController } from '@/hooks/useDemoTrip';
import { useRouteChangeMotion, type RouteMotion } from '@/hooks/useRouteChangeMotion';
import { useSpokenChanges } from '@/hooks/useSpeech';
import { replayTrip } from '@/lib/replay';
import { useReplay } from '@/stores/replay';
import { presenterKey, usePrefs } from '@/stores/prefs';
import { MapListView } from '@/components/map/MapListView';
import { ReplayPill } from '@/components/console/ReplayPill';
import { Header, StatusBanners } from '@/components/console/Header';
import { IncidentQueue } from '@/components/console/IncidentQueue';
import { ChangeBanner, changeBannerVisible, DemoTripPanel } from '@/components/console/DemoTripPanel';
import { QrCard } from '@/components/console/QrCard';
import { Timeline } from '@/components/console/Timeline';
import { OperatorTokenDialog } from '@/components/console/OperatorTokenDialog';
import { MapPanel } from '@/components/map/MapPanel';
import { t } from '@/i18n';

/**
 * The map stage sits between the docked columns, so the camera only needs a little air at its
 * edges, plus room for the notice row while a banner or the replay pill shows.
 */
const MAP_INSETS: Insets = { top: 40, right: 48, bottom: 72, left: 48 };
/** While the route-change banner shows, the camera re-fits below it (about 96 px tall). */
const BANNER_SPACE = 104;
/** The replay pill is a single line. */
const REPLAY_SPACE = 56;
/** The banner retires itself after this long; the timeline and the decision's "What changed" remain. */
const BANNER_MS = 15_000;
/** Scale of the decision column in presenter mode (projector readability). */
const PRESENTER_ZOOM = 1.2;

/** /console: 1920 x 1080 projector layout (DESIGN.md 11.4, UX_FLOWS section 9). */
export function ConsoleScreen() {
  useEffect(() => {
    useOperator.getState().hydrate();
    useScenarioStore.getState().hydrate();
  }, []);
  useScenarioList();
  useLiveSync();
  useDemoTripController();
  const scenario = useActiveScenario();
  const live = isLiveScenario(scenario);
  const feed = useFeedStatus(scenario.id, live);

  const liveTrip = useTripStore((s) => s.trip);
  const liveMotion = useRouteChangeMotion(liveTrip?.change ?? null);
  const presenter = usePrefs((s) => s.presenter);
  const listView = usePrefs((s) => s.listView);

  // P toggles presenter mode; Escape leaves it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const next = presenterKey(e, usePrefs.getState().presenter);
      if (next !== null) {
        e.preventDefault();
        usePrefs.getState().set('presenter', next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Decision replay: rebuild the trip at the scrubbed moment from the run's history.
  const replayAtS = useReplay((s) => s.atS);
  const replayEntries = useReplay((s) => s.entries);
  const replay = useMemo(
    () => (replayAtS !== null && replayEntries ? replayTrip(tripEnv(scenario.id), replayEntries, replayAtS) : null),
    [replayAtS, replayEntries, scenario.id],
  );
  useEffect(() => useReplay.getState().exit(), [scenario.id]);
  const trip = replay?.trip ?? liveTrip;
  // A replayed moment is shown settled: no flash, no draw-in.
  const motion = useMemo<RouteMotion>(() => (replay ? { phase: 'settled', flashOn: false, change: replay.trip.change } : liveMotion), [replay, liveMotion]);
  useSpokenChanges(replay ? null : liveTrip);
  const sync = useLiveStore((s) => s.sync);
  const optimistic = useLiveStore((s) => s.optimistic);
  const confirmed = useLiveStore((s) => s.confirmed);
  const pulses = useLiveStore((s) => s.pulses);
  const liveNowS = useLiveStore((s) => s.simTimeS);
  const nowS = replay?.atS ?? liveNowS;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedChange, setDismissedChange] = useState<number | null>(null);
  const bannerUp = !replay && changeBannerVisible(trip, motion, dismissedChange);
  const changeId = trip?.change?.id ?? null;
  useEffect(() => {
    if (changeId === null) return;
    const timer = setTimeout(() => setDismissedChange(changeId), BANNER_MS);
    return () => clearTimeout(timer);
  }, [changeId]);
  const insets = useMemo<Insets>(
    () => (bannerUp || replay ? { ...MAP_INSETS, top: MAP_INSETS.top + (bannerUp ? BANNER_SPACE : REPLAY_SPACE) } : MAP_INSETS),
    [bannerUp, replay],
  );

  const liveIncidents = useMemo(() => displayIncidents({ sync, optimistic, confirmed }), [sync, optimistic, confirmed]);
  const incidents = replay?.incidents ?? liveIncidents;
  const scene = useMemo(() => buildScene(tripEnv(scenario.id), GRAPH_FILE, trip, motion, incidents), [scenario.id, trip, motion, incidents]);
  // Camera: the trip's places and every candidate route, with a little air around them.
  const fit = useMemo(() => {
    const pts = [scene.origin, scene.destination, ...scene.otherPlaces].filter((p) => p !== null).map((p) => p.point);
    for (const l of scene.lines) if (l.kind !== 'floodProne' && l.kind !== 'old' && l.kind !== 'blocking') for (const [lng, lat] of l.coords) pts.push({ lat, lng });
    return boundsOf(pts, 0.03);
  }, [scene]);
  const noViable = !!trip && trip.plan.noViableRoute && !recommendedRoute(trip.plan);
  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="flex h-dvh min-h-[calc(var(--spacing)*200)] w-full min-w-[calc(var(--spacing)*320)] flex-col overflow-hidden bg-shell text-base text-ink-on-shell">
      <Header replayAtS={replay?.atS ?? null} />
      <div className="flex min-h-0 flex-1">
        {!presenter && (
          <aside aria-label={t.queue.title} className="flex w-95 shrink-0 flex-col border-r border-shell-line bg-shell-raised">
            <IncidentQueue selectedId={selectedId} onSelect={toggle} incidents={incidents} nowS={nowS} readOnly={!!replay} trip={trip} />
            <QrCard />
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <section className="absolute inset-0" aria-label={t.map.region} aria-hidden={listView || undefined}>
              <MapPanel
                scene={scene}
                incidents={incidents}
                nowS={nowS}
                pulses={pulses}
                selectedId={selectedId}
                onSelectIncident={toggle}
                insets={insets}
                fit={fit}
                dimmed={noViable}
                extraAttribution={live ? (feed.data?.attribution ?? null) : null}
              />
            </section>
            {listView && <MapListView trip={trip} incidents={incidents} nowS={nowS} style={bannerUp || replay ? { paddingTop: bannerUp ? 168 : 96 } : undefined} />}
            {/* Notices, replay state and the route-change banner, over the top of the map stage. */}
            <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex flex-col items-center gap-2 px-6">
              <StatusBanners />
              {replay && <ReplayPill atS={replay.atS} />}
              {!replay && <ChangeBanner trip={trip} motion={motion} dismissedId={dismissedChange} onDismiss={setDismissedChange} />}
            </div>
          </div>
          <Timeline replayAtS={replay?.atS ?? null} />
        </main>

        <aside aria-label={t.trip.title} className={presenter ? 'w-150 shrink-0 border-l border-shell-line bg-shell-raised' : 'w-115 shrink-0 border-l border-shell-line bg-shell-raised'}>
          {/* Presenter mode enlarges the whole decision for the room. */}
          <div className="h-full" style={presenter ? { zoom: PRESENTER_ZOOM } : undefined}>
            <DemoTripPanel trip={trip} motion={motion} incidents={incidents} nowS={nowS} />
          </div>
        </aside>
      </div>
      <OperatorTokenDialog />
    </div>
  );
}
