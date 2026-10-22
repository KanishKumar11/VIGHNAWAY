import { forwardRef, Fragment, memo, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type EdgePadding, type MapStyleElement, type Region } from 'react-native-maps';
import type { Incident } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Hospital, MapPin as PinIcon, Navigation, X } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { StatusRing } from '@/components/StatusRing';
import { t } from '@/i18n/en';
import { createStyles, fontFamily, lineStyle, marker, radius, spacing, type, useColors, useTheme, zIndex } from '@/theme';
import { sliceCoords, type MapIncident, type MapLine, type MapPin, type MapRouteLabel } from './mapModel';
import { useLanguage } from '@/i18n/useLanguage';


interface Props {
  initialRegion: Region;
  padding: EdgePadding;
  lines: MapLine[];
  travelled: MapLine | null;
  pins: MapPin[];
  vehiclePin: MapPin | null;
  markers: MapIncident[];
  /** Time bubbles on the routes (see routeLabelsFor). */
  routeLabels?: MapRouteLabel[];
  /** The traveller tapped a route or its bubble. */
  onSelectRoute?: (routeId: string) => void;
  /** Google traffic layer (display only; never used for routing). */
  showsTraffic?: boolean;
  /** The phone's own position (Google's location dot with its accuracy circle); display only. */
  showsUserLocation?: boolean;
  onUserLocation?: (p: { lat: number; lng: number; accuracyM: number | null }) => void;
  onReady: () => void;
  onIncidentPress: (incident: Incident) => void;
  onMapPress: () => void;
  /** The traveller dragged the map (not a camera move the app made). */
  onUserPan?: () => void;
  onRegionChange: (r: Region) => void;
}

/** Custom-view markers track view changes only briefly after their content changes (BUILD_PROMPT 8.6). */
function useTracksViewChanges(key: string): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 500);
    return () => clearTimeout(id);
  }, [key]);
  return tracks;
}

/** Above this many markers the age labels step aside, so a busy live map stays readable (the age is in the incident sheet). */
const AGE_LABELS_MAX = 8;

const IncidentMarker = memo(function IncidentMarker({ item, showAge, onPress }: { item: MapIncident; showAge: boolean; onPress: (i: Incident) => void }) {
  const tc = useColors();
  const styles = useStyles();
  const inc = item.incident;
  const tracks = useTracksViewChanges(`${inc.status}|${inc.type}|${item.ageLabel}`);
  const closed = inc.status === 'resolved' || inc.status === 'dismissed';
  return (
    <Marker
      coordinate={item.coordinate}
      anchor={{ x: 0.5, y: 0.35 }}
      zIndex={zIndex.incidentMarker}
      tracksViewChanges={tracks}
      onPress={() => onPress(inc)}
      accessibilityLabel={item.a11y}
    >
      <View style={styles.incident}>
        <View style={[styles.incidentCircle, closed && styles.closed]}>
          <View style={StyleSheet.absoluteFill}>
            <StatusRing status={inc.status} size={marker.mapSize} strokeWidth={marker.ringWidth} />
          </View>
          <IncidentGlyph type={inc.type} size={marker.mapGlyphSize} color={closed ? tc.resolved : tc.ink} />
        </View>
        {showAge ? (
          <View style={styles.agePill}>
            <AppText variant="label" tone="onShell" maxFontSizeMultiplier={1} style={styles.ageText}>
              {item.ageLabel}
            </AppText>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

/** A time bubble on a route (Google Maps style): the total on the chosen route, "+6 min" on an alternative. */
const RouteBubble = memo(function RouteBubble({ label, onPress }: { label: MapRouteLabel; onPress?: (routeId: string) => void }) {
  const styles = useStyles();
  const tracks = useTracksViewChanges(`${label.text}|${label.primary}`);
  return (
    <Marker
      coordinate={label.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={zIndex.blockingMarker}
      tracksViewChanges={tracks}
      onPress={() => onPress?.(label.routeId)}
      accessibilityLabel={label.text}
      testID={`route-bubble-${label.primary ? 'main' : 'alt'}`}
    >
      <View style={[styles.bubble, label.primary ? styles.bubbleMain : styles.bubbleAlt]}>
        <AppText variant="label" maxFontSizeMultiplier={1} style={label.primary ? styles.bubbleMainText : styles.bubbleAltText}>
          {label.text}
        </AppText>
      </View>
    </Marker>
  );
});

const Pin = memo(function Pin({ pin }: { pin: MapPin }) {
  useLanguage();
  const tc = useColors();
  const styles = useStyles();
  const tracks = useTracksViewChanges(pin.kind);
  if (pin.kind === 'vehicle') {
    return (
      <Marker
        coordinate={pin.coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        flat
        rotation={pin.headingDeg ?? 0}
        zIndex={zIndex.vehicle}
        tracksViewChanges={tracks}
      >
        <View style={styles.vehicle}>
          <Navigation size={18} color={tc.ink} fill={tc.routeRecommended} strokeWidth={2} />
        </View>
      </Marker>
    );
  }
  return (
    <Marker coordinate={pin.coordinate} anchor={{ x: 0.5, y: pin.kind === 'destination' ? 1 : 0.5 }} zIndex={zIndex.blockingMarker} tracksViewChanges={tracks}>
      {pin.kind === 'origin' ? (
        <View style={styles.originOuter}>
          <View style={styles.originInner} />
        </View>
      ) : pin.kind === 'destination' ? (
        <View style={styles.destination}>
          {pin.hospital === false ? <PinIcon size={18} color={tc.ink} strokeWidth={2} /> : <Hospital size={18} color={tc.ink} strokeWidth={2} />}
        </View>
      ) : (
        <View style={styles.blocking}>
          <View style={styles.blockingIcon}>
            <X size={12} color={tc.white} strokeWidth={3.5} />
          </View>
          <AppText variant="label" tone="danger">
            {t('notViable')}
          </AppText>
        </View>
      )}
    </Marker>
  );
});

/**
 * One route line. Revealing: progressive coordinates (polylines cannot animate their stroke).
 * Settled: drawn as runs, interrupted where the engine marks an edge blocked, with congested runs
 * overlaid by a dashed warning centreline (a static speed cue that survives a screenshot).
 */
function LineView({ line, onSelect }: { line: MapLine; onSelect?: (routeId: string) => void }) {
  const tc = useColors();
  const s = lineStyle(tc, line.style);
  const dash = s.dash && Platform.OS === 'android' ? [...s.dash] : undefined;
  const runs = useMemo(
    () => (line.reveal < 1 || !line.flow ? [sliceCoords(line.coords, line.reveal)] : line.flow.runs),
    [line.coords, line.reveal, line.flow],
  );
  const slow = line.reveal >= 1 && line.flow && line.style !== 'blocked' ? line.flow.slow : [];
  return (
    <>
      {runs.map((coords, i) => (
        <Fragment key={`r${i}`}>
          {line.casing && s.casing ? (
            <Polyline
              coordinates={coords}
              strokeColor={s.casing}
              strokeWidth={s.casingWidth}
              zIndex={line.zIndex}
              lineCap="round"
              lineJoin="round"
              tappable={!!line.routeId}
              onPress={line.routeId ? () => onSelect?.(line.routeId!) : undefined}
            />
          ) : null}
          <Polyline
            coordinates={coords}
            strokeColor={withOpacity(line.color ?? s.color, line.opacity ?? s.opacity)}
            strokeWidth={line.width ?? s.width}
            lineDashPattern={dash}
            zIndex={line.zIndex}
            lineCap="round"
            lineJoin="round"
            tappable={!!line.routeId}
            onPress={line.routeId ? () => onSelect?.(line.routeId!) : undefined}
          />
        </Fragment>
      ))}
      {slow.map((coords, i) => (
        <Polyline
          key={`s${i}`}
          coordinates={coords}
          strokeColor={tc.warn}
          strokeWidth={2}
          lineDashPattern={Platform.OS === 'android' ? [4, 4] : undefined}
          zIndex={line.zIndex}
          lineCap="butt"
        />
      ))}
    </>
  );
}

/** Polylines take a colour, not an opacity: fold opacity into the colour string. */
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1 || !color.startsWith('#') || color.length !== 7) return color;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

export const GoogleMapLayer = forwardRef<MapView, Props>(function GoogleMapLayer(props, ref) {
  // The basemap follows the theme (googleMapStyles.light / .dark).
  const { mapStyle } = useTheme();
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={mapStyle as unknown as MapStyleElement[]}
      initialRegion={props.initialRegion}
      mapPadding={props.padding}
      toolbarEnabled={false}
      showsTraffic={!!props.showsTraffic}
      showsPointsOfInterests={false}
      showsBuildings={false}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={!!props.showsUserLocation}
      userLocationPriority="high"
      userLocationUpdateInterval={1000}
      userLocationFastestInterval={1000}
      onUserLocationChange={(e) => {
        const c = e.nativeEvent.coordinate;
        if (c) props.onUserLocation?.({ lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy ?? null });
      }}
      moveOnMarkerPress={false}
      onMapReady={props.onReady}
      onPress={props.onMapPress}
      onPanDrag={() => {
        props.onMapPress();
        props.onUserPan?.();
      }}
      onRegionChangeComplete={props.onRegionChange}
    >
      {props.lines.map((l) => (
        <LineView key={l.key} line={l} onSelect={props.onSelectRoute} />
      ))}
      {props.travelled ? <LineView line={props.travelled} /> : null}
      {props.pins.map((p) => (
        <Pin key={p.key} pin={p} />
      ))}
      {(props.routeLabels ?? []).map((l) => (
        <RouteBubble key={l.key} label={l} onPress={props.onSelectRoute} />
      ))}
      {props.markers.map((m) => (
        <IncidentMarker key={m.incident.id} item={m} showAge={props.markers.length <= AGE_LABELS_MAX} onPress={props.onIncidentPress} />
      ))}
      {props.vehiclePin ? <Pin pin={props.vehiclePin} /> : null}
    </MapView>
  );
});

const useStyles = createStyles((tc) => ({
  // The padding keeps a comfortable touch area around the small circle.
  incident: { alignItems: 'center', padding: spacing.xxs },
  incidentCircle: {
    width: marker.mapSize,
    height: marker.mapSize,
    borderRadius: marker.mapSize / 2,
    backgroundColor: tc.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closed: { backgroundColor: tc.panelSunken },
  bubble: { paddingHorizontal: spacing.xs + 2, paddingVertical: spacing.xxs, borderRadius: radius.chip, borderWidth: 1 },
  bubbleMain: { backgroundColor: tc.routeRecommended, borderColor: tc.routeRecommendedCasing },
  bubbleMainText: { color: tc.onAccent, fontFamily: fontFamily.bold },
  bubbleAlt: { backgroundColor: tc.panelRaised, borderColor: tc.routeMuted },
  bubbleAltText: { color: tc.ink, fontFamily: fontFamily.semibold },
  ageText: { fontSize: type.meta.size - 2, lineHeight: marker.mapAgePillHeight - 2 },
  agePill: {
    marginTop: spacing.xxs,
    minHeight: marker.mapAgePillHeight,
    paddingHorizontal: spacing.xs - 2,
    borderRadius: radius.chip,
    backgroundColor: tc.shellOverlay,
    borderWidth: 1,
    borderColor: tc.shellHairlineStrong,
    justifyContent: 'center',
  },
  vehicle: {
    width: marker.size - spacing.xs,
    height: marker.size - spacing.xs,
    borderRadius: radius.marker,
    backgroundColor: tc.panel,
    borderWidth: 2,
    borderColor: tc.routeRecommendedCasing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originOuter: {
    width: spacing.lg,
    height: spacing.lg,
    borderRadius: spacing.sm,
    backgroundColor: tc.routeRecommendedCasing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originInner: { width: spacing.sm, height: spacing.sm, borderRadius: spacing.xs, backgroundColor: tc.routeRecommended },
  destination: {
    width: marker.size - spacing.xxs,
    height: marker.size - spacing.xxs,
    borderRadius: radius.button,
    backgroundColor: tc.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 1,
    paddingLeft: spacing.xxs,
    paddingRight: spacing.xs,
    height: spacing.lg - 2,
    borderRadius: radius.chip,
    backgroundColor: tc.dangerSurface,
  },
  blockingIcon: { width: spacing.md, height: spacing.md, borderRadius: radius.chip, backgroundColor: tc.danger, alignItems: 'center', justifyContent: 'center' },
}));
