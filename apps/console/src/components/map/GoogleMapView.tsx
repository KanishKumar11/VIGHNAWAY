'use client';

import { APILoadingStatus, Map, Polyline, useApiLoadingStatus, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import type { Incident, LatLng } from '@vighnaway/contracts';
import { consoleGoogleMapStyles as googleMapStyles, consoleThemes as themes } from '@vighnaway/tokens';
import { CarFront, MapPin } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { insetsOf, type Bbox, type Insets } from '@/lib/projection';
import { themeColor } from '@/lib/theme';
import { useTheme } from '@/stores/theme';
import type { MapScene, SceneLine } from '@/lib/scene';
import { GRAPH_FILE } from '@/lib/scenario';
import { IncidentMarker } from '@/components/shared/IncidentMarker';
import { markerDensity } from '@/lib/incidents';
import { BlockedCross, HospitalMarker, OriginMarker, VehicleMarker } from './PlaceMarkers';
import { MapLegend } from './MapLegend';

const LOAD_TIMEOUT_MS = 12_000;

/**
 * HTML content anchored to a coordinate through an OverlayView. Avoids AdvancedMarker, which
 * needs a cloud map id and would disable the custom style JSON from the tokens.
 */
function HtmlOverlay({ position, zIndex, anchor = 'center', children }: { position: LatLng; zIndex: number; anchor?: 'center' | 'bottom' | 'marker' | 'cross'; children: ReactNode }) {
  const map = useMap();
  const [container] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const pos = useRef(position);
  const overlay = useRef<google.maps.OverlayView | null>(null);
  pos.current = position;

  useEffect(() => {
    if (!map || !container || typeof google === 'undefined') return;
    class Overlay extends google.maps.OverlayView {
      override onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(container!);
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(container!);
      }
      override draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.current.lat, pos.current.lng));
        if (!p) return;
        container!.style.position = 'absolute';
        container!.style.left = `${p.x}px`;
        container!.style.top = `${p.y}px`;
      }
      override onRemove() {
        container!.remove();
      }
    }
    const o = new Overlay();
    o.setMap(map);
    overlay.current = o;
    return () => {
      o.setMap(null);
      overlay.current = null;
    };
  }, [map, container]);

  useEffect(() => {
    overlay.current?.draw();
  }, [position.lat, position.lng]);

  if (!container) return null;
  container.style.zIndex = String(zIndex);
  container.style.transform =
    anchor === 'center'
      ? 'translate(-50%, -50%)'
      : anchor === 'bottom'
        ? 'translate(-50%, -100%)'
        : anchor === 'cross'
          ? 'translate(calc(var(--vw-space-sm) * -1), -50%)'
          : 'translate(-50%, calc(var(--vw-marker-size) / -2))';
  return createPortal(children, container);
}

function SceneLines({ lines: raw }: { lines: SceneLine[] }) {
  const theme = useTheme((s) => s.theme);
  // Polylines need concrete colours: resolve each token value in the active theme.
  const lines = raw.map((l) => ({ ...l, color: themeColor(l.color, theme), casing: l.casing ? themeColor(l.casing, theme) : null }));
  return (
    <>
      {lines.map((l) => {
        const path = l.coords.map(([lng, lat]) => ({ lat, lng }));
        const icons = l.dash
          ? [
              {
                icon: { path: 'M 0,-1 0,1', strokeOpacity: l.opacity, strokeColor: l.color, strokeWeight: l.width, scale: Math.max(1, l.dash[0]! / 2) },
                offset: '0',
                repeat: `${l.dash[0]! + l.dash[1]!}px`,
              },
            ]
          : undefined;
        return (
          <Fragment key={l.key}>
            {/* Soft glow under the recommended route, like the schematic view. */}
            {l.kind === 'recommended' && l.opacity > 0 && (
              <Polyline path={path} strokeColor={l.color} strokeWeight={l.casingWidth + 10} strokeOpacity={0.18} zIndex={l.z * 10 - 1} clickable={false} />
            )}
            {l.casing && <Polyline path={path} strokeColor={l.casing} strokeWeight={l.casingWidth} strokeOpacity={l.opacity} zIndex={l.z * 10} clickable={false} />}
            <Polyline
              path={path}
              strokeColor={l.color}
              strokeWeight={l.width}
              strokeOpacity={l.dash ? 0 : l.opacity}
              icons={icons}
              zIndex={l.z * 10 + 1}
              clickable={false}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/** Calls onFail when the Maps JS API fails to load, rejects the key, or never finishes loading. */
function FailureWatch({ onFail }: { onFail: () => void }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) onFail();
  }, [status, onFail]);
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = onFail;
    const timer = setTimeout(() => {
      if (typeof google === 'undefined' || !google.maps?.Map) onFail();
    }, LOAD_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      if (w.gm_authFailure === onFail) delete w.gm_authFailure;
    };
  }, [onFail]);
  return null;
}

export interface GoogleMapViewProps {
  scene: MapScene;
  incidents?: readonly Incident[];
  nowS?: number;
  pulses?: Record<string, number>;
  selectedId?: string | null;
  onSelectIncident?: (id: string) => void;
  onPick?: (p: LatLng) => void;
  pick?: LatLng | null;
  onFail: () => void;
  compact?: boolean;
  /** Space taken by floating panels: the camera fits the trip in the rest. */
  insets?: number | Insets;
  /** What the camera fits (default: the whole graph). */
  fit?: Bbox | null;
  /** No viable route: the route layer dims. */
  dimmed?: boolean;
  /** Live mode: the traffic feed's attribution. */
  extraAttribution?: string | null;
}

/**
 * Google's own traffic layer, drawn under our overlays. Display only: it never reaches the
 * engine, which plans from incidents alone.
 */
function TrafficLayer({ on }: { on: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !on || typeof google === 'undefined') return;
    const layer = new google.maps.TrafficLayer();
    layer.setMap(map);
    return () => layer.setMap(null);
  }, [map, on]);
  return null;
}

function TrafficToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t.map.trafficLabel}
      onClick={() => onChange(!on)}
      className={cn(
        'vw-press surface absolute top-4 left-4 z-20 flex h-9 items-center gap-2 rounded-chip px-3.5 text-meta font-semibold',
        on ? 'text-ink-on-shell' : 'text-ink-on-shell-muted',
      )}
    >
      <CarFront aria-hidden className="size-4" />
      {t.map.traffic}
      <span className={cn('relative h-4 w-7 rounded-chip transition-colors', on ? 'bg-ink-on-shell' : 'bg-shell-hairline-strong')}>
        <span className={cn('absolute top-0.5 size-3 rounded-chip bg-shell-deep transition-transform', on ? 'translate-x-3.5' : 'translate-x-0.5')} />
      </span>
      <span className="font-normal text-ink-on-shell-muted">{t.map.trafficLabel}</span>
    </button>
  );
}

/** Re-fits the camera when the fitted box changes (destination switch), padded for the rails. */
function CameraFit({ fit, padding }: { fit: Bbox; padding: google.maps.Padding }) {
  const map = useMap();
  const key = `${fit.south},${fit.west},${fit.north},${fit.east}`;
  useEffect(() => {
    if (!map) return;
    map.fitBounds({ south: fit.south, west: fit.west, north: fit.north, east: fit.east }, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Google basemap styled with tokens.googleMapStyle; the same scene as the schematic view. */
export function GoogleMapView({
  scene,
  incidents = [],
  nowS = 0,
  pulses = {},
  selectedId = null,
  onSelectIncident,
  onPick,
  pick = null,
  onFail,
  compact = false,
  insets,
  fit = null,
  dimmed = false,
  extraAttribution = null,
}: GoogleMapViewProps) {
  const [traffic, setTraffic] = useState(false);
  const theme = useTheme((s) => s.theme);
  const bbox = fit ?? GRAPH_FILE.bbox;
  const pad = insetsOf(insets ?? (compact ? 8 : 32));
  const density = markerDensity(incidents.length);
  const lines = dimmed ? scene.lines.map((l) => ({ ...l, opacity: l.opacity * 0.4 })) : scene.lines;
  return (
    <div className="relative h-full w-full bg-shell-deep">
      <FailureWatch onFail={onFail} />
      <Map
        className="h-full w-full"
        defaultBounds={{ south: bbox.south, west: bbox.west, north: bbox.north, east: bbox.east, padding: pad }}
        styles={googleMapStyles[theme] as unknown as google.maps.MapTypeStyle[]}
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        gestureHandling="greedy"
        backgroundColor={themes[theme].shellDeep}
        onClick={onPick ? (e: MapMouseEvent) => e.detail.latLng && onPick(e.detail.latLng) : undefined}
      >
        <CameraFit fit={bbox} padding={pad} />
        <TrafficLayer on={traffic} />
        <SceneLines lines={lines} />
        {scene.otherPlaces.map((p) => (
          <HtmlOverlay key={p.id} position={p.point} zIndex={2} anchor="bottom">
            <HospitalMarker place={p} active={false} />
          </HtmlOverlay>
        ))}
        {scene.destination && (
          <HtmlOverlay position={scene.destination.point} zIndex={3} anchor="bottom">
            <HospitalMarker place={scene.destination} active />
          </HtmlOverlay>
        )}
        {scene.origin && (
          <HtmlOverlay position={scene.origin.point} zIndex={3}>
            <OriginMarker place={scene.origin} />
          </HtmlOverlay>
        )}
        {scene.blockedCrosses.map((m) => (
          <HtmlOverlay key={m.key} position={m.point} zIndex={7} anchor="cross">
            <BlockedCross label={m.label} />
          </HtmlOverlay>
        ))}
        {incidents.map((inc) => (
          <HtmlOverlay key={inc.id} position={inc.point} zIndex={selectedId === inc.id ? 9 : 8} anchor="marker">
            <IncidentMarker incident={inc} nowS={nowS} pulseKey={pulses[inc.id] ?? 0} selected={selectedId === inc.id} onSelect={onSelectIncident} density={density} />
          </HtmlOverlay>
        ))}
        {scene.vehicle && (
          <HtmlOverlay position={scene.vehicle} zIndex={10}>
            <VehicleMarker headingDeg={scene.vehicle.headingDeg} />
          </HtmlOverlay>
        )}
        {pick && (
          <HtmlOverlay position={pick} zIndex={11} anchor="bottom">
            <MapPin aria-hidden className="size-10 fill-route-recommended text-shell" strokeWidth={1.5} />
          </HtmlOverlay>
        )}
      </Map>
      {!compact && <TrafficToggle on={traffic} onChange={setTraffic} />}
      <MapLegend schematic={false} unavailable={false} compact={compact} insets={pad} extraAttribution={extraAttribution} />
      <p className="surface pointer-events-none absolute top-4 right-4 z-20 flex h-9 items-center rounded-chip px-3.5 text-meta text-ink-on-shell-muted">{t.map.googleAttribution}</p>
    </div>
  );
}
