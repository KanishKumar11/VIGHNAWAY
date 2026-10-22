import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type MapView from 'react-native-maps';
import type { EdgePadding, Region } from 'react-native-maps';
import type { Incident } from '@vighnaway/contracts';
import { googleMapsConfigured, MAP_READY_TIMEOUT_MS } from '@/config/env';
import { t } from '@/i18n/en';
import { buildIncidentIndex } from '@vighnaway/engine';
import { evalContext, getGraph, routeCoords, type MapCoord } from '@/lib/engine';
import { checkLocationPermission } from '@/lib/location';
import { isReduceMotion } from '@/lib/motion';
import { useIncidentList } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, motion } from '@/theme';
import { GoogleMapLayer } from './GoogleMapLayer';
import { useLaunchReveal, useMapModel } from './mapModel';
import { SchematicMap } from './SchematicMap';

interface Props {
  padding: EdgePadding;
  /** Padding the schematic fits its drawing into (sheet at peek), so it stays still while the sheet moves. */
  fitPadding: EdgePadding;
  dimmed: boolean;
  onIncidentPress: (i: Incident) => void;
  onMapPress: () => void;
}

/**
 * The map. Subscribes only to what it draws (the sim clock in whole minutes, for age labels), so
 * sheet and banner updates never re-render the MapView. Falls back to a labelled schematic when
 * no key is configured or onMapReady never fires.
 */
export const NavigateMap = memo(function NavigateMap({ padding, fitPadding, dimmed, onIncidentPress, onMapPress }: Props) {
  const styles = useStyles();
  const mapRef = useRef<MapView>(null);
  const graphFile = useScenario((s) => s.graphFile);
  const scenario = useScenario((s) => s.scenario);
  const profile = useSettings((s) => s.profile);
  const plan = useTrip((s) => s.plan);
  const planContext = useTrip((s) => s.planContext);
  const vehicle = useTrip((s) => s.vehicle);
  const transition = useTrip((s) => s.transition);
  const originId = useTrip((s) => s.originId);
  const destinationId = useTrip((s) => s.destinationId);
  const minuteS = useSim((s) => Math.floor(s.simTimeS / 60) * 60);
  const incidents = useIncidentList();
  const mapStatus = useUi((s) => s.mapStatus);
  // Google's traffic layer is display only: it never reaches the engine.
  const showsTraffic = useSettings((s) => s.googleTraffic);
  // Live mode shows where the phone really is, once location is allowed (never asked for here).
  const liveMode = useSettings((s) => s.dataMode === 'live');
  const permission = useUi((s) => s.locationPermission);
  const showsUser = liveMode && (permission === 'precise' || permission === 'approximate');
  const recenter = useUi((s) => s.recenterRequest);
  const [failure, setFailure] = useState<string | null>(googleMapsConfigured ? null : t('mapUnavailable'));

  const graph = useMemo(() => getGraph(graphFile, profile), [graphFile, profile]);
  const origin = placeById(scenario, originId);
  const destination = placeById(scenario, destinationId);
  const revealProgress = useLaunchReveal(plan?.recommendedRouteId ? planContext : null);
  const ctx = useMemo(() => evalContext(scenario, minuteS), [scenario, minuteS]);
  const index = useMemo(() => buildIncidentIndex(incidents), [incidents]);
  const model = useMapModel({ graph, plan, vehicle, transition, incidents, origin, destination, nowS: minuteS, revealProgress, ctx, index });

  // onMapReady never firing (rejected key, no network on first load) means the map is unusable.
  useEffect(() => {
    if (failure) {
      useUi.getState().setMapStatus('unavailable');
      return;
    }
    if (mapStatus === 'ready') return;
    const id = setTimeout(() => setFailure(t('mapUnavailable')), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [failure, mapStatus]);

  const initialRegion = useMemo<Region>(() => {
    const b = graphFile.bbox;
    return {
      latitude: (b.north + b.south) / 2,
      longitude: (b.east + b.west) / 2,
      latitudeDelta: (b.north - b.south) * 1.3,
      longitudeDelta: (b.east - b.west) * 1.3,
    };
  }, [graphFile]);

  useEffect(() => {
    if (liveMode) void checkLocationPermission();
  }, [liveMode]);

  // "Show my location": centre on the latest fix, close enough to read the streets.
  useEffect(() => {
    const p = useUi.getState().devicePosition;
    if (!recenter || !p || !mapRef.current) return;
    mapRef.current.animateCamera({ center: { latitude: p.lat, longitude: p.lng }, zoom: 17 }, { duration: isReduceMotion() ? 0 : 450 });
  }, [recenter]);

  // Camera: fit every route on a new plan context; fit old and new route on a route change.
  const fit = (coords: MapCoord[]) => {
    if (coords.length < 2 || !mapRef.current || mapStatus !== 'ready') return;
    mapRef.current.fitToCoordinates(coords, { edgePadding: padding, animated: !isReduceMotion() });
  };
  useEffect(() => {
    if (!plan) return;
    fit(plan.routes.flatMap((r) => routeCoords(graph, r.edgeIds, r.routeId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planContext, mapStatus]);
  useEffect(() => {
    if (!transition || !plan) return;
    const to = plan.routes.find((r) => r.routeId === transition.toRouteId);
    const coords = [
      ...(transition.fromRoute ? routeCoords(graph, transition.fromRoute.edgeIds, transition.fromRoute.routeId) : []),
      ...(to ? routeCoords(graph, to.edgeIds, to.routeId) : []),
    ];
    fit(coords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition?.id]);

  return (
    <View style={StyleSheet.absoluteFill} testID="navigate-map">
      {failure ? (
        <SchematicMap graphFile={graphFile} padding={fitPadding} onIncidentPress={onIncidentPress} {...model} />
      ) : (
        <GoogleMapLayer
          ref={mapRef}
          initialRegion={initialRegion}
          padding={padding}
          showsTraffic={showsTraffic}
          showsUserLocation={showsUser}
          onUserLocation={(p) => useUi.getState().setDevicePosition(p)}
          onReady={() => useUi.getState().setMapStatus('ready')}
          onIncidentPress={onIncidentPress}
          onMapPress={onMapPress}
          onRegionChange={(r) => useUi.getState().setMapCenter({ lat: r.latitude, lng: r.longitude })}
          {...model}
        />
      )}
      {dimmed ? (
        <Animated.View
          entering={isReduceMotion() ? undefined : FadeIn.duration(motion.noViableRoute)}
          exiting={isReduceMotion() ? undefined : FadeOut.duration(motion.noViableRoute)}
          pointerEvents="none"
          style={styles.dim}
        />
      ) : null}
    </View>
  );
});

const useStyles = createStyles((tc) => ({
  // No viable route: the map dims to 40% under the sheet (scrim is 60% navy).
  dim: { ...StyleSheet.absoluteFill, backgroundColor: tc.scrim },
}));
