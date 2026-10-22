import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import type { GraphFile, Incident } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Hospital, X } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { MapFieldLayer } from '@/components/MapField';
import { springEntry } from '@/components/motion';
import { StatusRing } from '@/components/StatusRing';
import {
  approximateRailway,
  chainEdges,
  dedupePoints,
  estimateMonoWidth,
  placeLabels,
  polylineLength,
  roadClass,
  samplePolyline,
  simplifyPath,
  smoothPath,
  type ChainEdge,
  type LabelCandidate,
  type Pt,
  type Rect,
} from '@/lib/geometry';
import { t } from '@/i18n/en';
import { getLanguage } from '@/i18n/lang';
import type { MapCoord } from '@/lib/engine';
import { useReduceMotion } from '@/lib/motion';
import { createStyles, devanagari, fontFamily, lineStyle, marker, motion, radius, routeStyles, shadow, spacing, type, useColors, useTheme } from '@/theme';
import type { MapIncident, MapLine, MapPin } from './mapModel';

interface Props {
  graphFile: GraphFile;
  /** Visible map area (under the header, above the sheet at peek). */
  padding: { top: number; bottom: number; left: number; right: number };
  lines: MapLine[];
  travelled: MapLine | null;
  pins: MapPin[];
  vehiclePin: MapPin | null;
  markers: MapIncident[];
  onIncidentPress: (incident: Incident) => void;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Corner radius for smoothed roads and routes (px), after simplifying wiggles under SIMPLIFY px. */
const CORNER = spacing.md;
const SIMPLIFY = spacing.xs + 2;
/** Map labels: Manrope, sentence case, a step under metadata size (DESIGN_VISION 6). */
const LABEL_SIZE = type.meta.size - 2;
const LABEL_TRACK = 0;
/** Average Manrope glyph width as a share of the font size, for collision boxes (Inter's is 0.54). */
const LABEL_RATIO = 0.58;
const LABEL_H = LABEL_SIZE + spacing.xxs;

type Project = (c: MapCoord) => Pt;

/**
 * Fallback when the Google map cannot load (DESIGN.md 11.3): a labelled schematic of the road
 * graph drawn as premium cartography over the navy field. Same routes, incidents and vehicle as
 * the map. The legend chip "Schematic view, not a map" rides above the sheet (NavigateScreen).
 */
export const SchematicMap = memo(function SchematicMap(props: Props) {
  const styles = useStyles();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { bbox } = props.graphFile;
  const { top, bottom, left, right } = props.padding;

  const project = useMemo<Project>(() => {
    const kx = Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180);
    const spanX = (bbox.east - bbox.west) * kx;
    const spanY = bbox.north - bbox.south;
    const availW = Math.max(1, size.w - left - right - spacing.md * 2);
    const availH = Math.max(1, size.h - top - bottom - spacing.lg * 2);
    const scale = Math.min(availW / spanX, availH / spanY);
    const offX = left + spacing.md + (availW - spanX * scale) / 2;
    const offY = top + spacing.lg + (availH - spanY * scale) / 2;
    return (c: MapCoord) => ({
      x: offX + (c.longitude - bbox.west) * kx * scale,
      y: offY + (bbox.north - c.latitude) * scale,
    });
  }, [bbox, size, top, bottom, left, right]);

  const visible: Rect = useMemo(
    () => ({ x: spacing.xs, y: top + spacing.xxs, w: Math.max(0, size.w - spacing.md), h: Math.max(0, size.h - top - bottom - spacing.xs) }),
    [size, top, bottom],
  );

  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <>
          <Svg width={size.w} height={size.h} accessible={false}>
            <MapFieldLayer width={size.w} height={size.h} cy={(top + (size.h - bottom)) / 2 / size.h} />
            <Basemap graphFile={props.graphFile} project={project} />
            {[...props.lines].sort((a, b) => a.zIndex - b.zIndex).map((l) => (
              <RouteLine key={l.key} line={l} project={project} />
            ))}
            {props.travelled ? <RouteLine line={props.travelled} project={project} /> : null}
            {props.markers
              .filter((m) => m.incident.type === 'flood' && m.incident.status !== 'resolved' && m.incident.status !== 'dismissed')
              .map((m) => (
                <FloodContour key={`fc-${m.incident.id}`} item={m} project={project} />
              ))}
            <Labels graphFile={props.graphFile} project={project} visible={visible} lines={props.lines} pins={props.pins} markers={props.markers} />
          </Svg>
          {props.pins.map((pin) => (
            <PinView key={pin.key} pin={pin} project={project} />
          ))}
          {props.markers.map((m) => (
            <IncidentMarker key={m.incident.id} item={m} project={project} showAge={props.markers.length <= AGE_LABELS_MAX} onPress={props.onIncidentPress} />
          ))}
          {props.vehiclePin ? <Vehicle pin={props.vehiclePin} project={project} /> : null}
        </>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------------------------
// Basemap: roads by class, railway with ties, bridges over the railway.

interface RoadShape {
  id: string;
  d: string;
  cls: 'major' | 'minor' | 'path';
  bridge: boolean;
  tunnel: boolean;
}

const Basemap = memo(function Basemap({ graphFile, project }: { graphFile: GraphFile; project: Project }) {
  const { colors: tc, dark } = useTheme();
  // Road and railway edges: the deep field at night, crisp white casings by day.
  const edge = dark ? tc.shellDeep : tc.panel;
  const { roads, railway } = useMemo(() => {
    const seen = new Set<string>();
    const undirected: (ChainEdge & { cls: RoadShape['cls']; bridge: boolean; tunnel: boolean })[] = [];
    for (const e of graphFile.edges) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.reverseId) seen.add(e.reverseId);
      const cls = roadClass(e.highway);
      undirected.push({ id: e.id, from: e.from, to: e.to, key: `${e.name ?? e.id}|${cls}|${e.bridge}|${e.tunnel}`, geometry: e.geometry, cls, bridge: e.bridge, tunnel: e.tunnel });
    }
    const meta = new Map(undirected.map((e) => [e.id, e]));
    const out: RoadShape[] = chainEdges(undirected).map((c) => {
      const m = meta.get(c.ids[0]!)!;
      const pts = simplifyPath(dedupePoints(c.coords.map(([lng, lat]) => project({ latitude: lat, longitude: lng }))), SIMPLIFY);
      return { id: c.ids.join('+'), d: smoothPath(pts, CORNER), cls: m.cls, bridge: m.bridge, tunnel: m.tunnel };
    });
    const rail = approximateRailway(graphFile);
    const railD = rail ? smoothPath(rail.map(([lng, lat]) => project({ latitude: lat, longitude: lng })), spacing.xl) : null;
    return { roads: out, railway: railD };
  }, [graphFile, project]);

  const ground = roads.filter((r) => !r.bridge);
  const bridges = roads.filter((r) => r.bridge);
  const roadStroke = (r: RoadShape) =>
    r.cls === 'major'
      ? { stroke: tc.roadMajor, strokeWidth: spacing.xs }
      : r.cls === 'minor'
        ? { stroke: tc.roadMajor, strokeWidth: spacing.xxs + 1 }
        : { stroke: tc.inkOnShellMuted, strokeWidth: 1.5, strokeOpacity: 0.45, strokeDasharray: [2, 4] };
  return (
    <G>
      {/* Minor roads under major roads; a dark edge keeps junctions crisp. */}
      {ground
        .filter((r) => r.cls === 'minor')
        .map((r) => (
          <Path key={r.id} d={r.d} {...roadStroke(r)} strokeOpacity={r.tunnel ? 0.55 : 0.85} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      {ground
        .filter((r) => r.cls === 'major')
        .map((r) => (
          <G key={r.id} opacity={r.tunnel ? 0.6 : 1}>
            <Path d={r.d} stroke={edge} strokeWidth={spacing.xs + 3} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={dark ? 0.6 : 1} />
            <Path d={r.d} {...roadStroke(r)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={r.d} stroke={tc.shellHairlineStrong} strokeWidth={1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
      {ground
        .filter((r) => r.cls === 'path')
        .map((r) => (
          <Path key={r.id} d={r.d} {...roadStroke(r)} fill="none" strokeLinecap="round" />
        ))}
      {railway ? (
        <G>
          <Path d={railway} stroke={edge} strokeWidth={spacing.sm} strokeOpacity={0.7} fill="none" strokeLinecap="round" />
          <Path d={railway} stroke={tc.railway} strokeWidth={spacing.xs - 1} strokeOpacity={0.35} strokeDasharray={[1.5, 5]} fill="none" />
          <Path d={railway} stroke={tc.railway} strokeWidth={2} strokeOpacity={0.85} fill="none" strokeLinecap="round" />
        </G>
      ) : null}
      {/* Bridges pass over the railway: drawn last with a dark casing. */}
      {bridges.map((r) => (
        <G key={r.id}>
          <Path d={r.d} stroke={edge} strokeWidth={r.cls === 'path' ? spacing.xs : spacing.sm + 2} fill="none" strokeLinecap="butt" />
          <Path d={r.d} {...roadStroke(r)} fill="none" strokeLinecap="butt" />
        </G>
      ))}
    </G>
  );
});

// ---------------------------------------------------------------------------------------------
// Labels: small caps mono with a navy halo; lower-priority labels drop out on collision.

const Labels = memo(function Labels({
  graphFile,
  project,
  visible,
  lines,
  pins,
  markers,
}: {
  graphFile: GraphFile;
  project: Project;
  visible: Rect;
  lines: MapLine[];
  pins: MapPin[];
  markers: MapIncident[];
}) {
  const { colors: tc, dark } = useTheme();
  const halo = dark ? tc.shellDeep : tc.panel;
  // Obstacles change only when the set of routes or markers changes, not on every reveal step.
  const routeKey = lines.map((l) => l.key).join(',');
  const markerKey = markers.map((m) => m.incident.id).join(',') + pins.map((p) => p.key).join(',');
  const placed = useMemo(() => {
    const byName = new Map<string, { len: number; mid: Pt; cls: 'major' | 'minor' | 'path'; crossing: boolean }>();
    for (const e of graphFile.edges) {
      if (!e.name) continue;
      const pts = e.geometry.map(([lng, lat]) => project({ latitude: lat, longitude: lng }));
      const len = polylineLength(pts);
      const prev = byName.get(e.name);
      const crossing = e.bridge || e.tunnel;
      if (!prev || len > prev.len) {
        const a = pts[Math.floor((pts.length - 1) / 2)]!;
        const b = pts[Math.min(pts.length - 1, Math.floor((pts.length - 1) / 2) + 1)]!;
        byName.set(e.name, { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cls: roadClass(e.highway), crossing: crossing || !!prev?.crossing });
      }
    }
    const cands: LabelCandidate[] = [];
    for (const [name, v] of byName) {
      if (v.len < spacing.xl) continue;
      const text = name;
      cands.push({
        id: name,
        text,
        x: v.mid.x,
        y: v.mid.y,
        priority: (v.crossing ? 30 : 0) + (v.cls === 'major' ? 20 : v.cls === 'minor' ? 10 : 0) + Math.min(9, v.len / 40),
        w: estimateMonoWidth(text, LABEL_SIZE, LABEL_TRACK, LABEL_RATIO),
        h: LABEL_H,
      });
    }
    const rail = approximateRailway(graphFile);
    if (rail && rail.length > 2) {
      // Beside the railway, a third of the way down its visible run.
      const [lng, lat] = rail[Math.max(1, Math.floor(rail.length / 3))]!;
      const p = project({ latitude: lat, longitude: lng });
      const text = t('railwayLabel');
      const w = estimateMonoWidth(text, LABEL_SIZE, LABEL_TRACK, LABEL_RATIO);
      cands.push({ id: '~railway', text, x: p.x + w / 2 + spacing.sm, y: p.y - spacing.xl, priority: 45, w, h: LABEL_H });
    }
    const obstacles: Rect[] = [];
    const box = (p: Pt, half: number): Rect => ({ x: p.x - half, y: p.y - half, w: half * 2, h: half * 2 });
    for (const m of markers) obstacles.push(box(project(m.coordinate), marker.mapSize / 2 + spacing.xxs), { ...box(project(m.coordinate), marker.mapSize / 2), y: project(m.coordinate).y + marker.mapSize / 2 });
    for (const p of pins) obstacles.push(box(project(p.coordinate), spacing.md));
    // Routes and the railway: sampled every few px so straight runs block labels too.
    for (const l of lines) {
      if (l.style === 'floodProne') continue;
      for (const p of samplePolyline(l.coords.map(project), spacing.xs)) obstacles.push(box(p, spacing.xxs + 2));
    }
    if (rail) for (const p of samplePolyline(rail.map(([lng, lat]) => project({ latitude: lat, longitude: lng })), spacing.xs)) obstacles.push(box(p, spacing.xxs + 1));
    return placeLabels(cands, obstacles, visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphFile, project, visible, routeKey, markerKey]);

  return (
    <G>
      {placed.map((l) => {
        const common = {
          x: l.x,
          y: l.y + LABEL_SIZE * 0.36,
          fontSize: LABEL_SIZE,
          fontFamily: getLanguage() === 'en' ? fontFamily.medium : devanagari.medium,
          textAnchor: 'middle' as const,
        };
        const strong = l.id === '~railway' || l.priority >= 30;
        return (
          <G key={l.id}>
            <SvgText {...common} stroke={halo} strokeWidth={3} strokeLinejoin="round" fill={halo}>
              {l.text}
            </SvgText>
            <SvgText {...common} fill={strong ? tc.inkOnShell : tc.inkOnShellMuted} fillOpacity={strong ? 0.85 : 0.75}>
              {l.text}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
});

// ---------------------------------------------------------------------------------------------
// Routes (DESIGN_VISION 7.2): structure by role, no glow. Speed is static: congested runs carry a
// dashed warning centreline and blocked edges are left out, so the line is visibly interrupted.
// Motion happens only on change: the recommended route draws in from its start (the vehicle).

const runsPath = (runs: MapCoord[][], project: Project) =>
  runs
    .map((r) => smoothPath(simplifyPath(dedupePoints(r.map(project)), SIMPLIFY), CORNER))
    .filter(Boolean)
    .join(' ');

const RouteLine = memo(function RouteLine({ line, project }: { line: MapLine; project: Project }) {
  const tc = useColors();
  const reduce = useReduceMotion();
  const pts = useMemo(() => simplifyPath(dedupePoints(line.coords.map(project)), SIMPLIFY), [line.coords, project]);
  const d = useMemo(() => smoothPath(pts, CORNER), [pts]);
  const runsD = useMemo(() => (line.flow ? runsPath(line.flow.runs, project) : d), [line.flow, project, d]);
  const slowD = useMemo(() => (line.flow ? runsPath(line.flow.slow, project) : ''), [line.flow, project]);
  const len = useMemo(() => polylineLength(pts) + spacing.xs, [pts]);
  const s = lineStyle(tc, line.style);
  const old = line.key.startsWith('old-');
  const flash = line.key.startsWith('flash-');

  // Draw-in of a newly recommended route (launch, or step 5 of the route change).
  const drawn = useSharedValue(line.reveal);
  useEffect(() => {
    drawn.value = reduce ? line.reveal : withTiming(line.reveal, { duration: 140, easing: Easing.linear });
  }, [line.reveal, reduce, drawn]);
  // Step 3: the superseded route loses emphasis once (opacity only, no loop).
  const sink = useSharedValue(old && !reduce ? 1 : 0.45);
  useEffect(() => {
    if (old && !reduce) sink.value = withTiming(0.45, { duration: motion.routeChangeTotal / 2 });
  }, [old, reduce, sink]);
  const drawCasing = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - drawn.value) }));
  const drawMain = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - drawn.value) }));
  const sinkProps = useAnimatedProps(() => ({ strokeOpacity: sink.value }));

  if (!d) return null;
  const color = line.color ?? s.color;
  const width = line.width ?? s.width;
  const dash = [len, len];
  const drawing = line.reveal < 1;

  if (line.style === 'floodProne') {
    return <Path d={d} stroke={tc.floodProneSolid} strokeOpacity={0.55} strokeWidth={spacing.xxs} strokeDasharray={[0.1, spacing.xs + 1]} strokeLinecap="round" fill="none" />;
  }
  if (flash) {
    // Step 2: the affected segment is briefly emphasised.
    return <Path d={d} stroke={tc.danger} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  if (old) {
    return <AnimatedPath d={runsD} stroke={tc.routeMuted} strokeWidth={routeStyles.alternative.width} strokeDasharray={[6, 6]} animatedProps={sinkProps} strokeLinecap="butt" fill="none" />;
  }
  if (line.style === 'blocked') {
    return <Path d={runsD} stroke={color} strokeWidth={width} strokeDasharray={s.dash ? [...s.dash] : undefined} strokeLinecap="butt" strokeLinejoin="round" fill="none" />;
  }
  const slow = slowD && !drawing ? <Path d={slowD} stroke={tc.warn} strokeWidth={2} strokeDasharray={[4, 4]} strokeLinecap="butt" fill="none" /> : null;
  if (line.style !== 'recommended' && line.style !== 'travelled') {
    return (
      <G opacity={line.opacity ?? s.opacity}>
        <Path d={runsD} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {slow}
      </G>
    );
  }
  return (
    <G>
      {line.casing && s.casing ? (
        drawing ? (
          <AnimatedPath d={d} stroke={s.casing} strokeWidth={s.casingWidth} strokeDasharray={dash} animatedProps={drawCasing} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : (
          <Path d={runsD} stroke={s.casing} strokeWidth={s.casingWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )
      ) : null}
      {drawing ? (
        <AnimatedPath d={d} stroke={color} strokeWidth={width} strokeDasharray={dash} animatedProps={drawMain} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <Path d={runsD} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {slow}
    </G>
  );
});

/**
 * A restrained flood contour (DESIGN_VISION 9): a dotted outline around a reported flood, sized by
 * the reported depth. Static; it fades in once when the report appears. Never fills the map.
 */
const FloodContour = memo(function FloodContour({ item, project }: { item: MapIncident; project: Project }) {
  const tc = useColors();
  const inc = item.incident;
  const p = project(item.coordinate);
  const r = marker.mapSize / 2 + (inc.depth === 'waist' ? spacing.lg : inc.depth === 'knee' ? spacing.md : spacing.xs);
  return <Circle cx={p.x} cy={p.y} r={r} stroke={tc.floodProneSolid} strokeWidth={1.5} strokeDasharray={[2, 4]} strokeLinecap="round" fill={tc.floodProne} fillOpacity={0.35} />;
});

// ---------------------------------------------------------------------------------------------
// Pins, markers and the vehicle: native views over the SVG (springs, pulses, touch targets).

const PIN = spacing.lg;
const BLOCK_W = spacing.xl * 3 + spacing.sm;

function PinView({ pin, project }: { pin: MapPin; project: Project }) {
  const tc = useColors();
  const styles = useStyles();
  const p = project(pin.coordinate);
  if (pin.kind === 'origin') {
    return (
      <View pointerEvents="none" style={[styles.anchor, { left: p.x - PIN / 2, top: p.y - PIN / 2, width: PIN, height: PIN }]}>
        <View style={styles.originOuter}>
          <View style={styles.originInner} />
        </View>
      </View>
    );
  }
  if (pin.kind === 'destination') {
    const s = marker.size - spacing.xxs;
    return (
      <View pointerEvents="none" style={[styles.anchor, { left: p.x - s / 2, top: p.y - s - spacing.xs, width: s, height: s + spacing.xs }]}>
        <View style={[styles.destination, { width: s, height: s }, shadow('sm')]}>
          <Hospital size={18} color={tc.ink} strokeWidth={2} />
        </View>
        <View style={styles.destinationStem} />
      </View>
    );
  }
  if (pin.kind === 'blocking') {
    const leftSide = p.x - BLOCK_W - marker.mapSize / 2 > spacing.sm;
    // The incident marker sits on the same spot: the cross and "Not viable" sit beside it, with a
    // short leader back to the blocked segment.
    return (
      <Animated.View
        entering={springEntry(ZoomIn, motion.springSnappy)}
        pointerEvents="none"
        style={[
          styles.blockWrap,
          leftSide
            ? { left: p.x - BLOCK_W - marker.mapSize / 2 - spacing.xxs, top: p.y - spacing.sm - 1 }
            : { left: p.x + marker.mapSize / 2 + spacing.xxs, top: p.y - spacing.sm - 1, flexDirection: 'row-reverse' },
        ]}
      >
        <View style={[styles.blockPill, shadow('sm')]}>
          <View style={styles.blockIcon}>
            <X size={12} color={tc.white} strokeWidth={3.5} />
          </View>
          <AppText variant="label" tone="danger" numberOfLines={1}>
            {t('notViable')}
          </AppText>
        </View>
        <View style={styles.blockLeader} />
      </Animated.View>
    );
  }
  return null;
}

/** Above this many markers the age labels step aside, so a busy live map stays readable (the age is in the incident sheet). */
const AGE_LABELS_MAX = 24;

const IncidentMarker = memo(function IncidentMarker({ item, project, showAge, onPress }: { item: MapIncident; project: Project; showAge: boolean; onPress: (i: Incident) => void }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const inc = item.incident;
  const p = project(item.coordinate);
  const closed = inc.status === 'resolved' || inc.status === 'dismissed';
  const size = marker.mapSize;
  return (
    <Animated.View
      entering={reduce ? undefined : springEntry(ZoomIn, motion.springSnappy)}
      style={[styles.markerWrap, { left: p.x - spacing.xl * 2, top: p.y - size / 2 }]}
    >
      <Pressable
        onPress={() => onPress(inc)}
        accessibilityRole="button"
        accessibilityLabel={item.a11y}
        accessibilityHint={t('markerHint')}
        testID="map-incident"
        hitSlop={spacing.xs}
        style={styles.markerHit}
      >
        <View style={[styles.markerCircle, { width: size, height: size, borderRadius: size / 2 }, closed && styles.markerClosed, shadow('sm')]}>
          <View style={StyleSheet.absoluteFill}>
            <StatusRing status={inc.status} size={size} strokeWidth={marker.ringWidth} />
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
      </Pressable>
    </Animated.View>
  );
});

const VEHICLE = spacing.xl * 2;

const Vehicle = memo(function Vehicle({ pin, project }: { pin: MapPin; project: Project }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const p = project(pin.coordinate);
  const x = useSharedValue(p.x);
  const y = useSharedValue(p.y);
  useEffect(() => {
    x.value = reduce ? p.x : withTiming(p.x, { duration: motion.launchReveal, easing: Easing.linear });
    y.value = reduce ? p.y : withTiming(p.y, { duration: motion.launchReveal, easing: Easing.linear });
  }, [p.x, p.y, reduce, x, y]);
  const pos = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - VEHICLE / 2 }, { translateY: y.value - VEHICLE / 2 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.vehicle, pos]} accessible accessibilityLabel={t('vehicleA11y')}>
      <View style={{ transform: [{ rotate: `${pin.headingDeg ?? 0}deg` }] }}>
        <Svg width={VEHICLE} height={VEHICLE} viewBox="0 0 64 64">
          {/* A plain heading arrow with a contrasting outline; no beam or glow (DESIGN_VISION 4.4). */}
          <Path d="M32 16 L44 44 L32 38 L20 44 Z" fill={tc.ink} stroke={tc.panel} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      </View>
    </Animated.View>
  );
});

const useStyles = createStyles((tc) => ({
  root: { ...StyleSheet.absoluteFill, backgroundColor: tc.shellDeep },
  anchor: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  originOuter: {
    width: spacing.md + 2,
    height: spacing.md + 2,
    borderRadius: radius.chip,
    backgroundColor: tc.routeRecommendedCasing,
    borderWidth: 2,
    borderColor: tc.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originInner: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.routeRecommended },
  destination: { borderRadius: radius.button, backgroundColor: tc.panelRaised, alignItems: 'center', justifyContent: 'center' },
  destinationStem: { width: 2, height: spacing.xs, backgroundColor: tc.panelRaised },
  blockWrap: { position: 'absolute', width: BLOCK_W, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  blockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 1,
    paddingLeft: spacing.xxs,
    paddingRight: spacing.xs,
    height: spacing.lg - 2,
    borderRadius: radius.chip,
    backgroundColor: tc.dangerSurface,
  },
  blockIcon: { width: spacing.md, height: spacing.md, borderRadius: radius.chip, backgroundColor: tc.danger, alignItems: 'center', justifyContent: 'center' },
  blockLeader: { width: spacing.xxs, height: 2, backgroundColor: tc.danger },
  markerWrap: { position: 'absolute', width: spacing.xl * 4, alignItems: 'center' },
  markerHit: { alignItems: 'center' },
  markerCircle: { backgroundColor: tc.panelRaised, alignItems: 'center', justifyContent: 'center' },
  markerClosed: { backgroundColor: tc.panelSunken },
  ageText: { fontSize: type.meta.size - 2, lineHeight: marker.mapAgePillHeight - 2 },
  agePill: {
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xs - 2,
    paddingVertical: 1,
    borderRadius: radius.chip,
    backgroundColor: tc.shellOverlay,
    borderWidth: 1,
    borderColor: tc.shellHairlineStrong,
  },
  vehicle: { position: 'absolute', left: 0, top: 0, width: VEHICLE, height: VEHICLE },
}));
