'use client';

import type { Incident, LatLng } from '@vighnaway/contracts';
import { motion as motionTokens, type as typeScale } from '@vighnaway/tokens';
import { MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { edgesGeometry, offsetPolyline, renderGeometryIndex, slideClear, roadChains, roundedPath, type Pt, type RoadClass } from '@/lib/mapGeometry';
import { buildMapLabels, labelSide, ROAD_WIDTH, type LabelSide } from '@/lib/mapLabels';
import { insetsOf, lerpBbox, makeProjection, type Bbox, type Insets, type Projection } from '@/lib/projection';
import { approximateRailway, type MapScene, type SceneLine } from '@/lib/scene';
import { GRAPH_FILE } from '@/lib/scenario';
import { themeVar } from '@/lib/theme';
import { useElementSize } from '@/hooks/useElementSize';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { IncidentMarker } from '@/components/shared/IncidentMarker';
import { BlockedCross, HospitalMarker, OriginMarker, VehicleMarker } from './PlaceMarkers';
import { MapLegend } from './MapLegend';

const CORNER_RADIUS = 22;
const LABEL_SIZE = typeScale.eyebrow.size;
const ease = motionTokens.easeOut as [number, number, number, number];

/** Road styling by class (schematic view only). */
const ROAD: Record<RoadClass, { cls: string; dash?: string; opacity?: number }> = {
  trunk: { cls: 'stroke-road-major' },
  primary: { cls: 'stroke-road-major' },
  secondary: { cls: 'stroke-road-major', opacity: 0.85 },
  minor: { cls: 'stroke-road-minor' },
  path: { cls: 'stroke-ink-on-shell-muted', dash: '2 4', opacity: 0.6 },
};
/**
 * Display-only simplification tolerance, metres: the fixture's residential lanes are drawn as
 * tight wiggles that read as noise at console scale, so lanes are straightened more than roads.
 */
const simplifyM = (highway: string) => (['residential', 'service', 'unclassified', 'living_street', 'tertiary'].includes(highway) ? 230 : 55);
/** Approximate width of a place name chip (13 px semibold Inter). */
const placeLabelWidth = (name: string) => name.length * 7.4 + 18;
const DRAW_ORDER: RoadClass[] = ['path', 'minor', 'secondary', 'primary', 'trunk'];

/** Points every `step` px along a polyline (for cheap proximity checks). */
function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const last = pts[pts.length - 1];
  if (last) out.push(last);
  return out;
}

const toPts = (proj: Projection, coords: readonly (readonly [number, number])[]): Pt[] => coords.map((c) => proj.tupleToXY([c[0], c[1]]));

interface Camera {
  bbox: Bbox;
  pad: Insets;
}

const lerpInsets = (a: Insets, b: Insets, k: number): Insets => ({
  top: a.top + (b.top - a.top) * k,
  right: a.right + (b.right - a.right) * k,
  bottom: a.bottom + (b.bottom - a.bottom) * k,
  left: a.left + (b.left - a.left) * k,
});

/**
 * Camera: tweens the fitted box and the padding together (a destination switch, or room made
 * for the route-change banner), with a gentle settle on first show. Instant under reduced motion.
 */
function useCamera(target: Bbox, pad: Insets, reduced: boolean): Camera {
  const [shown, setShown] = useState<Camera>({ bbox: target, pad });
  const from = useRef<Camera | null>(null);
  const first = useRef(true);
  const key = [target.south, target.west, target.north, target.east].map((n) => n.toFixed(5)).join() + `|${pad.top},${pad.right},${pad.bottom},${pad.left}`;
  useEffect(() => {
    const goal = { bbox: target, pad };
    const start: Camera = first.current
      ? { bbox: { south: target.south - 0.004, west: target.west - 0.006, north: target.north + 0.004, east: target.east + 0.006 }, pad }
      : (from.current ?? goal);
    const duration = first.current ? 1100 : 700;
    first.current = false;
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      from.current = goal;
      setShown(goal);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const c = { bbox: lerpBbox(start.bbox, goal.bbox, e), pad: lerpInsets(start.pad, goal.pad, e) };
      from.current = c;
      setShown(c);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  return shown;
}

/** Static speed treatment (DESIGN_VISION appendix A): stripes in the casing colour over the line. */
const FLOW_DASH: Record<'slow' | 'jam', string> = { slow: '2 10', jam: '3 4' };

function FlowOverlay({ l, runPts }: { l: SceneLine & { casing: string | null }; runPts: (edgeIds: readonly string[]) => Pt[] }) {
  if (!l.flow) return null;
  return (
    <g data-flow aria-hidden>
      {l.flow.map((run, i) => {
        if (run.state === 'free') return null;
        const d = roundedPath(runPts(run.edgeIds), CORNER_RADIUS);
        if (!d) return null;
        if (run.state === 'blocked') {
          // Interrupted: the line breaks where the road is blocked.
          return <path key={i} d={d} fill="none" strokeLinecap="butt" stroke="var(--vw-shell-deep)" strokeWidth={l.width + 1} strokeDasharray="6 5" />;
        }
        return (
          <path key={i} d={d} fill="none" strokeLinecap="butt" stroke={l.casing ?? 'var(--vw-shell-deep)'} strokeWidth={l.width + 0.5} strokeDasharray={FLOW_DASH[run.state]} data-state={run.state} />
        );
      })}
    </g>
  );
}

function RouteLine({ pts, l: raw, drawIn, drawMs, runPts }: { pts: Pt[]; l: SceneLine; drawIn: boolean; drawMs: number; runPts: (edgeIds: readonly string[]) => Pt[] }) {
  // Scene colours are token values; draw them through the active theme's CSS variables.
  const l = { ...raw, color: themeVar(raw.color), casing: raw.casing ? themeVar(raw.casing) : null };
  const d = roundedPath(pts, CORNER_RADIUS);
  if (!d) return null;
  const common = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (l.kind === 'recommended') {
    if (l.opacity === 0) return null;
    // Drawn from the vehicle along the engine's geometry, once the engine has produced it.
    const draw = drawIn ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: drawMs / 1000, ease } } : {};
    return (
      <g data-kind={l.kind}>
        {l.casing && <motion.path {...common} {...draw} stroke={l.casing} strokeWidth={l.casingWidth + 1} />}
        <motion.path {...common} {...draw} stroke={l.color} strokeWidth={l.width} />
        <motion.g initial={drawIn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: drawIn ? drawMs / 1000 : 0, duration: 0.2 }}>
          <FlowOverlay l={l} runPts={runPts} />
        </motion.g>
      </g>
    );
  }
  if (l.kind === 'floodProne') {
    // Known-risk road: a quiet dotted sky line either side of the road.
    return (
      <g data-kind={l.kind}>
        {[-1, 1].map((side) => (
          <path key={side} {...common} d={roundedPath(offsetPolyline(pts, side * l.width * 1.4), CORNER_RADIUS)} stroke="var(--vw-flood-prone-solid)" strokeWidth={2} strokeDasharray="0.1 6" />
        ))}
      </g>
    );
  }
  return (
    <g className="vw-line-fade vw-sink" style={{ opacity: l.opacity }} data-kind={l.kind}>
      {l.casing && <path {...common} className="vw-line-fade" style={{ stroke: l.casing, strokeWidth: l.casingWidth }} />}
      {l.kind !== 'blocking' && l.kind !== 'old' && <path {...common} style={{ stroke: 'var(--vw-shell-deep)', strokeWidth: l.width + 3 }} />}
      <path
        {...common}
        className="vw-line-fade"
        style={{ stroke: l.color, strokeWidth: l.kind === 'blocking' ? l.width + 4 : l.width }}
        strokeDasharray={l.dash ? l.dash.join(' ') : undefined}
      />
      {l.kind !== 'blocked' && l.kind !== 'old' && <FlowOverlay l={l} runPts={runPts} />}
    </g>
  );
}

/** Restrained contour at the incident that caused a change (DESIGN_VISION section 9, step 2). */
function FocusContour({ focus }: { focus: NonNullable<MapScene['focus']> }) {
  const size = focus.kind === 'block' ? 64 : focus.depth === 'waist' ? 120 : focus.depth === 'knee' ? 92 : 68;
  return (
    <span
      key={focus.changeId}
      aria-hidden
      className={cn('vw-water-rise block rounded-chip border-2 border-dashed', focus.kind === 'flood' ? 'border-flood-prone-solid bg-flood-prone' : 'border-danger')}
      style={{ width: size, height: size }}
    />
  );
}

type Anchor = 'center' | 'bottom' | 'marker' | 'cross' | 'crossLeft';
const ANCHOR: Record<Anchor, string> = {
  center: 'translate(-50%, -50%)',
  bottom: 'translate(-50%, -100%)',
  marker: 'translate(-50%, calc(var(--vw-marker-size) / -2))',
  cross: 'translate(calc(var(--vw-space-sm) * -1), -50%)',
  crossLeft: 'translate(calc(-100% + var(--vw-space-sm)), -50%)',
};

function At({ proj, point, children, anchor = 'center', z, glide = false }: { proj: Projection; point: LatLng; children: ReactNode; anchor?: Anchor; z: number; glide?: boolean }) {
  const { x, y } = proj.toXY(point);
  return (
    <div
      className={cn('absolute top-0 left-0', glide && 'transition-transform duration-1000 ease-linear')}
      style={{ transform: `translate(${x}px, ${y}px) ${ANCHOR[anchor]}`, zIndex: z }}
    >
      {children}
    </div>
  );
}

export interface SchematicMapProps {
  scene: MapScene;
  incidents?: readonly Incident[];
  nowS?: number;
  pulses?: Record<string, number>;
  selectedId?: string | null;
  onSelectIncident?: (id: string) => void;
  /** Report page: tap to place the pin. */
  onPick?: (p: LatLng) => void;
  pick?: LatLng | null;
  /** Show "Map unavailable" (no key or Google failed). */
  unavailable?: boolean;
  compact?: boolean;
  className?: string;
  /** Space taken by floating panels; the camera fits the trip inside the rest. */
  insets?: number | Insets;
  /** What the camera fits (default: the whole graph). */
  fit?: Bbox | null;
  /** No viable route: the map dims (motion.noViableMapDim). */
  dimmed?: boolean;
  /** Live mode: the traffic feed's attribution, shown with the map data attribution. */
  extraAttribution?: string | null;
}

/**
 * Schematic fallback for when Google Maps is unavailable, drawn as premium cartography
 * (DESIGN.md 11.3): a deep navy field with a faint grid and vignette, roads by class with
 * smoothed corners, the railway as a track with ties, the dotted flood-prone underlay, halo
 * labels placed without collisions, routes styled exactly like the map, live markers and the
 * vehicle. Labelled as a schematic view, not a map.
 */
export function SchematicMap({
  scene,
  incidents = [],
  nowS = 0,
  pulses = {},
  selectedId = null,
  onSelectIncident,
  onPick,
  pick = null,
  unavailable = true,
  compact = false,
  className,
  insets,
  fit = null,
  dimmed = false,
  extraAttribution = null,
}: SchematicMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { width, height } = useElementSize(ref);
  const targetPad = useMemo(() => insetsOf(insets ?? (compact ? 16 : 40)), [insets, compact]);
  const camera = useCamera(fit ?? GRAPH_FILE.bbox, targetPad, reduced);
  const pad = camera.pad;
  const proj = useMemo(() => makeProjection(camera.bbox, width, height, camera.pad), [camera, width, height]);
  const geometry = useMemo(() => renderGeometryIndex(GRAPH_FILE, simplifyM), []);
  const chains = useMemo(() => roadChains(GRAPH_FILE, geometry), [geometry]);
  const railway = useMemo(() => approximateRailway(GRAPH_FILE), []);
  const ready = width > 0 && height > 0;

  /** Screen points for a scene line, on the same display geometry as the base roads. */
  const linePts = (l: SceneLine): Pt[] => toPts(proj, (l.edgeIds && edgesGeometry(l.edgeIds, geometry)) || l.coords);
  const runPts = (edgeIds: readonly string[]): Pt[] => toPts(proj, edgesGeometry(edgeIds, geometry) ?? []);

  const floodLines = scene.lines.filter((l) => l.kind === 'floodProne');
  const routeLines = scene.lines.filter((l) => l.kind !== 'floodProne');

  const places = [scene.origin, scene.destination, ...scene.otherPlaces].filter((p) => p !== null);

  // The Not viable cross slides along its route until it clears the incident marker on it.
  const crosses = ready
    ? scene.blockedCrosses.map((c) => {
        const line = routeLines.find((l) => l.key === `r-blocked-${c.key.slice(2)}`);
        if (!line) return c;
        const marks = incidents.map((i) => proj.toXY(i.point));
        const q = slideClear(linePts(line), proj.toXY(c.point), marks, 46);
        // The words go on the side away from the nearest incident marker, so they never cover it.
        const near = marks.reduce<Pt | null>((best, m) => (!best || Math.hypot(m.x - q.x, m.y - q.y) < Math.hypot(best.x - q.x, best.y - q.y) ? m : best), null);
        const left = !!near && near.x > q.x && Math.hypot(near.x - q.x, near.y - q.y) < 160;
        return { ...c, point: proj.toLatLng(q.x, q.y), left };
      })
    : scene.blockedCrosses;
  // A place's name goes above its pin when an incident marker sits just below it.
  // ...or when a drawn route runs through where the name would sit.
  const routePts = ready ? routeLines.filter((l) => l.kind !== 'old' && l.kind !== 'blocking').flatMap((l) => densify(linePts(l), 8)) : [];
  const above = new Set(
    ready
      ? places
          .filter((p) => {
            const q = proj.toXY(p.point);
            const half = placeLabelWidth(p.name) / 2;
            const underIncident = incidents.some((i) => {
              const r = proj.toXY(i.point);
              return Math.abs(r.x - q.x) < 150 && r.y - q.y > -10 && r.y - q.y < 80;
            });
            const underRoute = routePts.some((r) => Math.abs(r.x - q.x) < half && r.y - q.y > 2 && r.y - q.y < 34);
            return underIncident || underRoute;
          })
          .map((p) => p.id)
      : [],
  );
  const sides = new Map<string, LabelSide>(
    places.map((p) => [p.id, ready ? labelSide(proj.toXY(p.point).x, width, pad, placeLabelWidth(p.name)) : 'center']),
  );

  const labels = useMemo(() => {
    if (!ready || compact) return [];
    return buildMapLabels({
      proj,
      width,
      height,
      pad,
      chains,
      railway,
      railwayText: t.map.railway,
      font: { size: LABEL_SIZE, lineHeight: typeScale.eyebrow.lineHeight, tracking: 0 },
      incidents: incidents.map((i) => i.point),
      places: places.map((p) => ({ point: p.point, side: sides.get(p.id) ?? 'center', labelWidth: placeLabelWidth(p.name), above: above.has(p.id) })),
      crosses: crosses.map((c) => c.point),
      vehicle: null,
      routes: routeLines.filter((l) => l.kind !== 'blocking' && l.kind !== 'old').map((l) => ({ pts: linePts(l), thickness: Math.max(l.casingWidth, l.width) + 6 })),
    });
    // Route geometry only changes with the plan; labels stay steady while the vehicle moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, compact, proj, chains, railway, width, height, pad, incidents.map((i) => i.id).join(), routeLines.filter((l) => l.kind !== 'blocking' && l.kind !== 'old').map((l) => `${l.key}:${l.edgeIds?.length ?? l.coords.length}`).join(), scene.destination?.id]);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onPick || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onPick(proj.toLatLng(e.clientX - rect.left, e.clientY - rect.top));
  };

  return (
    <div
      ref={ref}
      className={cn('vw-field relative h-full w-full overflow-hidden', onPick && 'cursor-crosshair', className)}
      onClick={onPick ? handleClick : undefined}
      role={onPick ? 'application' : 'img'}
      aria-label={t.map.schematicLabel}
    >
      {ready && (
        <>
          <svg width={width} height={height} className="absolute inset-0" aria-hidden>
            <defs>
              <pattern id="vw-grid" width={48} height={48} patternUnits="userSpaceOnUse">
                <path d="M48 0H0V48" fill="none" stroke="var(--vw-shell-hairline)" strokeWidth={1} />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#vw-grid)" opacity={0.6} />

            <motion.g initial={false} animate={{ opacity: dimmed ? motionTokens.noViableMapDim : 1 }} transition={{ duration: motionTokens.noViableRoute / 1000 }}>
              {/* Base roads, by class, smoothed. Bridges get a dark gap where they cross. */}
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                {DRAW_ORDER.flatMap((cls) =>
                  chains
                    .filter((c) => c.cls === cls)
                    .map((c) => {
                      const d = roundedPath(toPts(proj, c.coords), CORNER_RADIUS);
                      const s = ROAD[cls];
                      const w = ROAD_WIDTH[cls];
                      return (
                        <g key={c.key} opacity={s.opacity}>
                          {c.bridge && <path d={d} className="stroke-shell-deep" strokeWidth={w + 6} />}
                          {c.bridge && <path d={d} className="stroke-shell-hairline-strong" strokeWidth={w + 4} />}
                          <path d={d} className={s.cls} strokeWidth={w} strokeDasharray={c.tunnel ? '6 4' : s.dash} />
                          {cls !== 'path' && !c.tunnel && <path d={d} className="vw-road-fill" strokeWidth={Math.max(1.2, w - (cls === 'minor' ? 1.6 : 2.6))} />}
                          {cls === 'trunk' && <path d={d} className="stroke-shell-hairline-strong" strokeWidth={1} />}
                        </g>
                      );
                    }),
                )}
              </g>

              {/* Railway: a light track with cross-ties. */}
              {railway && (
                <g fill="none">
                  {(() => {
                    const [a, b] = toPts(proj, railway);
                    const d = `M${a!.x} ${a!.y} L${b!.x} ${b!.y}`;
                    return (
                      <>
                        <path d={d} className="stroke-shell-deep" strokeWidth={9} />
                        <path d={d} className="stroke-railway" strokeWidth={8} strokeDasharray="1.5 7" opacity={0.45} />
                        <path d={d} className="stroke-railway" strokeWidth={1.6} opacity={0.85} />
                      </>
                    );
                  })()}
                </g>
              )}

              {/* Known-risk underlay before any incident arrives. */}
              {floodLines.map((l) => (
                <RouteLine key={l.key} pts={linePts(l)} l={l} drawIn={false} drawMs={0} runPts={runPts} />
              ))}

              {routeLines.map((l) => (
                <RouteLine key={l.key} pts={linePts(l)} l={l} drawIn={!reduced} drawMs={l.key === 'rec-0' ? motionTokens.launchReveal : motionTokens.routeChangeTotal - 4 * motionTokens.routeChangeFlash} runPts={runPts} />
              ))}

              {labels.map((l) => {
                const crossing = l.id.startsWith('x:');
                return (
                  <text
                    key={l.id}
                    transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.angleDeg.toFixed(1)})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={cn('vw-map-label vw-halo', crossing ? 'fill-ink-on-shell' : l.id === 'rail' ? 'fill-railway' : 'fill-ink-on-shell-muted')}
                  >
                    {l.text}
                  </text>
                );
              })}
            </motion.g>
          </svg>
          {scene.focus && !reduced && (
            <At proj={proj} point={scene.focus.point} z={6}>
              <FocusContour focus={scene.focus} />
            </At>
          )}

          {scene.otherPlaces.map((p) => (
            <At key={p.id} proj={proj} point={p.point} anchor="bottom" z={2}>
              <HospitalMarker place={p} active={false} showLabel={!compact} side={sides.get(p.id)} above={above.has(p.id)} />
            </At>
          ))}
          {scene.destination && (
            <At proj={proj} point={scene.destination.point} anchor="bottom" z={3}>
              <HospitalMarker place={scene.destination} active showLabel={!compact} side={sides.get(scene.destination.id)} above={above.has(scene.destination.id)} />
            </At>
          )}
          {scene.origin && (
            <At proj={proj} point={scene.origin.point} z={3}>
              <OriginMarker place={scene.origin} showLabel={!compact} side={sides.get(scene.origin.id)} />
            </At>
          )}
          {crosses.map((m) => (
            <At key={m.key} proj={proj} point={m.point} anchor={'left' in m && m.left ? 'crossLeft' : 'cross'} z={7}>
              <BlockedCross label={m.label} left={'left' in m && !!m.left} />
            </At>
          ))}
          {incidents.map((inc) => (
            <At key={inc.id} proj={proj} point={inc.point} anchor="marker" z={selectedId === inc.id ? 9 : 8}>
              <IncidentMarker incident={inc} nowS={nowS} pulseKey={pulses[inc.id] ?? 0} selected={selectedId === inc.id} onSelect={onSelectIncident} />
            </At>
          ))}
          {scene.vehicle && (
            <At proj={proj} point={scene.vehicle} z={10} glide>
              <VehicleMarker headingDeg={scene.vehicle.headingDeg} />
            </At>
          )}
          {pick && (
            <At proj={proj} point={pick} anchor="bottom" z={11}>
              <motion.span className="block" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', ...motionTokens.springSnappy }}>
                <MapPin aria-hidden className="size-10 fill-route-recommended text-shell-deep" strokeWidth={1.5} />
              </motion.span>
            </At>
          )}
        </>
      )}

      <MapLegend unavailable={unavailable} compact={compact} insets={pad} extraAttribution={extraAttribution} />
    </div>
  );
}
