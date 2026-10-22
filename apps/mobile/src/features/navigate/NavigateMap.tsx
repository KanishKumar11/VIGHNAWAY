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
import { lastKnownPosition } from '@/features/search/startHere';
import { checkLocationPermission } from '@/lib/location';
import { haptic } from '@/lib/feedback';
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

/** Navigation camera: zoom, tilt and timings (like Google Maps' driving view). */
const NAV_ZOOM = 17;
const NAV_ZOOM_FOOT = 18;
const NAV_PITCH = 50;
/** The first fly-in when the trip starts, and the glide for each position after it. */
const FOLLOW_FLY_MS = 900;
const FOLLOW_GLIDE_MS = 900;
const FOLLOW_MIN_MS = 1000;
/** The map opens this wide (degrees, about 5 km) around the phone's last position. */
const LAST_FIX_DELTA = 0.05;
const CAMERA_FLY_MS = 700;

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
  const selectedRouteId = useTrip((s) => s.selectedRouteId);
  const mode = useTrip((s) => s.mode);
  const following = useUi((s) => s.following);
  const model = useMapModel({ graph, plan, vehicle, transition, incidents, origin, destination, nowS: minuteS, revealProgress, ctx, index, selectedRouteId });

  // Tapping an alternative (or its time bubble) chooses it, like Google Maps; tapping the recommended
  // one goes back to it. Only while planning: a running trip keeps its route.
  const onSelectRoute = (routeId: string) => {
    const trip = useTrip.getState();
    if (trip.mode !== 'planning' || !trip.plan) return;
    haptic.selection();
    trip.selectRoute(routeId === trip.plan.recommendedRouteId ? null : routeId);
  };

  // Navigation camera: when the trip starts the map zooms to the vehicle, tilts, turns to its heading
  // and follows it. The traveller dragging the map lets go; the re-centre button takes it back.
  const pin = model.vehiclePin;
  const lastFollow = useRef(0);
  const followVehicle = (duration: number) => {
    if (!pin || !mapRef.current) return;
    lastFollow.current = Date.now();
    mapRef.current.animateCamera(
      { center: pin.coordinate, heading: pin.headingDeg ?? 0, pitch: NAV_PITCH, zoom: profile === 'foot' ? NAV_ZOOM_FOOT : NAV_ZOOM },
      { duration: isReduceMotion() ? 0 : duration },
    );
  };
  const wasEnRoute = useRef(false);
  useEffect(() => {
    if (mode === 'en_route') {
      wasEnRoute.current = true;
      useUi.getState().setFollowing(true);
      return;
    }
    useUi.getState().setFollowing(false);
    if (wasEnRoute.current) {
      // The trip ended: tilt back to a flat, north-up overview of the whole route.
      wasEnRoute.current = false;
      mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: isReduceMotion() ? 0 : 350 });
      if (plan) fit(plan.routes.flatMap((r) => routeCoords(graph, r.edgeIds, r.routeId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Going to (or back to) following: fly to the vehicle at once.
  useEffect(() => {
    if (mode === 'en_route' && following) followVehicle(FOLLOW_FLY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, mode, mapStatus]);
  // Then keep up with it, at most once a second so the camera glides instead of stuttering.
  useEffect(() => {
    if (mode !== 'en_route' || !following || !pin) return;
    if (Date.now() - lastFollow.current < FOLLOW_MIN_MS) return;
    followVehicle(FOLLOW_GLIDE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.coordinate.latitude, pin?.coordinate.longitude, pin?.headingDeg]);

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
    // Live mode opens where the phone last was (like Google Maps), not on the demo area.
    const here = liveMode ? lastKnownPosition() : null;
    if (here) return { latitude: here.lat, longitude: here.lng, latitudeDelta: LAST_FIX_DELTA, longitudeDelta: LAST_FIX_DELTA };
    const b = graphFile.bbox;
    return {
      latitude: (b.north + b.south) / 2,
      longitude: (b.east + b.west) / 2,
      latitudeDelta: (b.north - b.south) * 1.3,
      longitudeDelta: (b.east - b.west) * 1.3,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphFile]);

  // Fly to a position the app asked for: where the phone is when it is found.
  const cameraRequest = useUi((s) => s.cameraRequest);
  useEffect(() => {
    if (!cameraRequest || !mapRef.current || mapStatus !== 'ready') return;
    mapRef.current.animateCamera(
      { center: { latitude: cameraRequest.center.lat, longitude: cameraRequest.center.lng }, zoom: cameraRequest.zoom, heading: 0, pitch: 0 },
      { duration: isReduceMotion() ? 0 : CAMERA_FLY_MS },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest?.nonce, mapStatus]);

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
        <SchematicMap graphFile={graphFile} padding={fitPadding} onIncidentPress={onIncidentPress} onSelectRoute={onSelectRoute} {...model} />
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
          onUserPan={() => useUi.getState().setFollowing(false)}
          onSelectRoute={onSelectRoute}
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
