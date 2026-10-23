import { useEffect } from 'react';
import { vehiclePosition } from '@vighnaway/engine';
import { getGraph } from '@/lib/engine';
import { speakChange } from '@/lib/speech';
import { useGuidance, legsFor } from '@/stores/guidance';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useTrip, activeRoute } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { t } from '@/i18n/en';
import { accessKey, loadAccess } from './access';
import { progressOn, type GuidePath, type GuideProgress } from './guide';
import { spokenInstruction } from './text';
import { tripGuidePath } from './tripPath';

/** Guidance runs on the roads-only map and with live data; the simulated Andheri demo keeps its own screens. */
export function guidanceEnabled(): boolean {
  return useSettings.getState().dataMode === 'live' || useScenario.getState().region !== 'andheri';
}

/** Distances at which a manoeuvre is announced: ahead of time, then just before it. */
const FAR_M = 260;
const NEAR_M = 70;
const ARRIVE_M = 40;
const OFF_ROUTE_REPEAT_MS = 25_000;

let said = new Set<string>();
let lastOffRouteAt = 0;
let announcedPath: GuidePath | null = null;

/** Rounds a distance to something a person says: 250 m, not 237 m. */
const roundSpoken = (m: number): number => (m >= 1000 ? Math.round(m / 100) * 100 : m >= 100 ? Math.round(m / 50) * 50 : Math.round(m / 10) * 10);

/** Speaks what is due at this progress. Each manoeuvre is announced once ahead and once when close. */
export function announce(path: GuidePath, p: GuideProgress, tripStart: boolean): void {
  if (announcedPath !== path) {
    announcedPath = path;
    said = new Set();
  }
  const mark = (k: string): boolean => {
    if (said.has(k)) return false;
    said.add(k);
    return true;
  };
  const first = path.maneuvers[0];
  if (tripStart && first && p.alongM < 30 && mark('depart')) {
    void speakChange(spokenInstruction(first, 0, path));
    return;
  }
  if (p.offRoute) {
    const now = Date.now();
    if (now - lastOffRouteAt > OFF_ROUTE_REPEAT_MS) {
      lastOffRouteAt = now;
      const text = t('guideOffRoute');
      void speakChange({ text, englishFallback: text });
    }
    return;
  }
  const id = `${p.next.kind}@${Math.round(p.next.atM)}`;
  if (p.next.kind === 'arrive') {
    if (p.nextDistM <= ARRIVE_M && mark(`${id}:near`)) void speakChange(spokenInstruction(p.next, 0, path));
    return;
  }
  if (p.nextDistM <= NEAR_M) {
    if (mark(`${id}:near`)) {
      said.add(`${id}:far`);
      void speakChange(spokenInstruction(p.next, 0, path));
    }
  } else if (p.nextDistM <= FAR_M && mark(`${id}:far`)) {
    void speakChange(spokenInstruction(p.next, roundSpoken(p.nextDistM), path));
  }
}

/**
 * Wires guidance to the stores (mounted once in the root layout): finds the local roads when a trip is
 * chosen, builds the whole-trip path when there is a route, and follows the phone along it during a trip.
 */
export function useGuidanceEngine(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadAccess(), 300);
    };
    kick();

    const rebuild = () => {
      const trip = useTrip.getState();
      const g = useGuidance.getState();
      const rec = activeRoute(trip.plan, trip.selectedRouteId);
      if (!guidanceEnabled() || !rec) {
        if (g.path) g.setPath(null);
        return;
      }
      const { graphFile } = useScenario.getState();
      const graph = getGraph(graphFile, useSettings.getState().profile);
      const legs = legsFor(accessKey());
      const edgeIds = trip.mode === 'en_route' && trip.vehicle ? trip.vehicle.edgeIds : rec.edgeIds;
      g.setPath(tripGuidePath(graph, edgeIds, legs.from, legs.to));
    };

    let started = false;
    const tick = () => {
      const trip = useTrip.getState();
      const g = useGuidance.getState();
      if (trip.mode !== 'en_route' || !g.path || !guidanceEnabled()) {
        started = false;
        if (g.progress) g.setProgress(null);
        return;
      }
      const live = useSettings.getState().dataMode === 'live';
      const { graphFile } = useScenario.getState();
      const graph = getGraph(graphFile, useSettings.getState().profile);
      const pos = live ? useUi.getState().devicePosition : trip.vehicle ? vehiclePosition(graph, trip.vehicle)?.point : null;
      if (!pos) return;
      const progress = progressOn(g.path, pos, g.progress?.alongM ?? 0);
      if (!progress) return;
      g.setProgress(progress);
      announce(g.path, progress, !started);
      started = true;
    };

    const unsubs = [
      useTrip.subscribe((s, p) => {
        if (s.originId !== p.originId || s.destinationId !== p.destinationId) kick();
        if (s.plan !== p.plan || s.selectedRouteId !== p.selectedRouteId || s.mode !== p.mode) rebuild();
        if (s.vehicle !== p.vehicle || s.mode !== p.mode) tick();
      }),
      useSettings.subscribe((s, p) => {
        if (s.profile !== p.profile) kick();
        if (s.dataMode !== p.dataMode) rebuild();
      }),
      useScenario.subscribe((s, p) => {
        if (s.region !== p.region) kick();
      }),
      useGuidance.subscribe((s, p) => {
        if (s.from !== p.from || s.to !== p.to) rebuild();
      }),
      useUi.subscribe((s, p) => {
        if (s.devicePosition !== p.devicePosition) tick();
      }),
    ];
    rebuild();
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);
}
