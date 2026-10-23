'use client';

import type { CongestionLevel, Depth, LatLng, ReportInput, ReportType, Severity, WalkingConcern } from '@vighnaway/contracts';
import { REPORT_DESCRIPTION_MAX, REPORT_TYPES, ReportInputSchema } from '@vighnaway/contracts';
import { humanSilhouette, motion as motionTokens } from '@vighnaway/tokens';
import successAnimation from '@vighnaway/tokens/lottie/success.json';
import { Check, CircleAlert, Eye, LocateFixed, MapPin, Send, TriangleAlert } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { t } from '@/i18n';
import { ApiError, describeApiError } from '@/lib/api';
import { sendReport } from '@/lib/sendReport';
import { cn } from '@/lib/cn';
import { scenarioFor, SCENARIO_ID } from '@/lib/scenarios';
import { getDeviceId } from '@/lib/storage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import dynamic from 'next/dynamic';
import type { ReportGraph } from './reportGraph';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { toast } from '@/components/ui/toast';

const NOT_ON_ROAD_M = 30;

/** The picker map draws the road graph, so it arrives after the form (the form is the page people reach by QR code on a phone). */
const MapPanel = dynamic(() => import('@/components/map/MapPanel').then((m) => m.MapPanel), {
  ssr: false,
  loading: () => <div role="status" className="grid size-full place-items-center bg-panel-sunken text-meta text-ink-muted">{t.map.loading}</div>,
});
type DepthChoice = Depth | 'unknown';
type FieldErrors = Partial<Record<'type' | 'congestion' | 'concern' | 'description' | 'point' | 'form', string>>;
const snappy = { type: 'spring' as const, ...motionTokens.springSnappy };
const soft = { type: 'spring' as const, ...motionTokens.springSoft };

/** Water level on the figure, as a fraction of its height from the feet (ankle bone, knee, belt). */
const WATER: Record<DepthChoice, number> = { ankle: 0.07, knee: 0.28, waist: 0.56, unknown: 0 };

/** The silhouette stands on y = FEET and is FIGURE_H tall inside the 120 x 160 tile. */
const FEET = 144;
const FIGURE_H = 124;
const SILHOUETTE_SCALE = FIGURE_H / humanSilhouette.size;

/** Visual depth selector: the human silhouette with the water rising to the chosen level. */
function DepthFigure({ depth }: { depth: DepthChoice | null }) {
  const level = depth ? WATER[depth] : 0;
  const top = level > 0 ? FEET - level * FIGURE_H : 160;
  return (
    <svg viewBox="0 0 120 160" className="h-44 w-32" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={4} width={112} height={152} rx={16} className="fill-panel-sunken" />
      <path d={`M14 ${FEET}H106`} className="stroke-ink-muted" strokeWidth={1.5} strokeDasharray="3 4" />
      <path
        d={humanSilhouette.d}
        className="fill-ink"
        transform={`translate(${60 - (humanSilhouette.size / 2) * SILHOUETTE_SCALE} ${FEET - FIGURE_H}) scale(${SILHOUETTE_SCALE})`}
      />
      <motion.g initial={false} animate={{ y: top - 150 }} transition={soft}>
        <rect x={4} y={150} width={112} height={160} className="fill-flood-prone" />
        <path d="M4 150c9-5 18-5 28 0s19 5 28 0 19-5 28 0 19 5 28 0" className="stroke-flood-prone-solid" strokeWidth={3} />
      </motion.g>
      {depth === 'unknown' && (
        <text x={60} y={136} textAnchor="middle" className="fill-ink-muted text-title font-semibold">
          ?
        </text>
      )}
    </svg>
  );
}

/** Segmented control with a shared sliding indicator. */
function Segmented<T extends string>({ id, options, value, onChange, labels, className }: { id: string; options: readonly T[]; value: T | null; onChange: (v: T) => void; labels: Record<T, string>; className?: string }) {
  return (
    <LayoutGroup id={id}>
      <div className={cn('grid gap-1 rounded-button bg-panel-sunken p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <motion.button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            whileTap={{ scale: motionTokens.buttonPressScale }}
            className={cn('relative min-h-12 rounded-button px-2 text-body font-semibold', value === o ? 'text-on-accent' : 'text-ink')}
          >
            {value === o && <motion.span layoutId="seg" className="absolute inset-0 rounded-button bg-accent" transition={snappy} />}
            <span className="relative">{labels[o]}</span>
          </motion.button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left text-body font-medium text-ink">
      <span>{label}</span>
      <span className={cn('relative h-8 w-14 shrink-0 rounded-chip transition-colors duration-200', checked ? 'bg-accent' : 'bg-control-border')}>
        <motion.span className="absolute top-1 left-1 size-6 rounded-chip bg-panel-raised" initial={false} animate={{ x: checked ? 24 : 0 }} transition={snappy} />
      </span>
    </button>
  );
}

/** A numbered step like the phone's report screen: a lime number and the title, then its controls on a white card. */
function Step({ index, label, error, children, id, bare = false }: { index: number; label: string; error?: string; children: ReactNode; id: string; bare?: boolean }) {
  return (
    <fieldset id={id} className="flex scroll-mt-6 flex-col gap-3" aria-describedby={error ? `${id}-err` : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-3 flex items-center gap-3 px-1">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-meta font-bold text-on-accent">
          {index}
        </span>
        <span className="text-title font-bold text-ink">{label}</span>
      </legend>
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-err`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="-mt-2 flex items-center gap-2 px-1 text-body font-semibold text-danger-ink"
          >
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {bare ? children : <div className="flex flex-col gap-3 rounded-card border border-panel-line bg-panel p-4 shadow-sm">{children}</div>}
    </fieldset>
  );
}

/** Builds the request body; only fields that apply to the type are sent. */
export function buildReportInput(f: {
  type: ReportType;
  depth: DepthChoice | null;
  congestion: CongestionLevel | null;
  severity: Severity | null;
  concern?: WalkingConcern | null;
  impassable: boolean;
  point: LatLng;
  note: string;
  observed: boolean;
  deviceId: string;
}): ReportInput {
  const input: ReportInput = { type: f.type, point: f.point, observedPersonally: f.observed, deviceId: f.deviceId };
  if (f.type === 'flood') input.depth = f.depth && f.depth !== 'unknown' ? f.depth : null;
  if (f.type === 'congestion' && f.congestion) input.congestion = f.congestion;
  if (f.type === 'debris' || f.type === 'accident') {
    input.severity = f.severity;
    input.impassable = f.impassable;
  }
  if (f.type === 'walking_concern' && f.concern) input.concern = f.concern;
  // A walking concern has no free text: it could name a person or a place.
  const note = f.note.trim();
  if (note && f.type !== 'walking_concern') input.description = note;
  return input;
}

type Phase = 'form' | 'sending' | 'success' | 'sent';

/** scenarioId: where the report goes (the QR on the console names the scenario it shows). */
export function ReportForm({ scenarioId = SCENARIO_ID, audience = false }: { scenarioId?: string; audience?: boolean }) {
  const ids = useId();
  const reduced = useReducedMotion();
  const [type, setType] = useState<ReportType | null>(null);
  const [depth, setDepth] = useState<DepthChoice | null>(null);
  const [congestion, setCongestion] = useState<CongestionLevel | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [concern, setConcern] = useState<WalkingConcern | null>(null);
  const [impassable, setImpassable] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [note, setNote] = useState('');
  const [observed, setObserved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>('form');
  // Live mode saves a report with no mapped road nearby as off-map: it changes no route, and the form says so.
  const [offMap, setOffMap] = useState(false);
  const liveScenario = !scenarioFor(scenarioId).simulated;
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  useEffect(() => setDeviceId(getDeviceId()), []);

  // The road graph (about 10 MB) is fetched once the form is on screen.
  const [graph, setGraph] = useState<ReportGraph | null>(null);
  useEffect(() => {
    let live = true;
    void import('./reportGraph').then((m) => {
      if (live) setGraph(m.loadReportGraph(scenarioId));
    });
    return () => {
      live = false;
    };
  }, [scenarioId]);
  const nearest = useMemo(() => (point && graph ? graph.nearestTo(point) : null), [point, graph]);
  const nearestName = nearest?.name ?? '';
  const noteLen = note.trim().length;
  const noteTooLong = noteLen > REPORT_DESCRIPTION_MAX;

  function locateMe() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationMsg(t.report.locationDenied);
      return;
    }
    setLocating(true);
    setLocationMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setErrors((e) => ({ ...e, point: undefined }));
      },
      () => {
        setLocating(false);
        setLocationMsg(t.report.locationDenied);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase !== 'form') return;
    const next: FieldErrors = {};
    if (!type) next.type = t.report.errors.type;
    if (type === 'congestion' && !congestion) next.congestion = t.report.errors.congestion;
    if (type === 'walking_concern' && !concern) next.concern = t.report.errors.concern;
    if (noteTooLong) next.description = t.report.errors.note;
    if (!point) next.point = t.report.errors.location;
    setErrors(next);
    if (Object.keys(next).length || !type || !point) {
      // Take the person to the first thing to fix.
      const first = next.type ? `${ids}-type` : next.congestion ? `${ids}-cong` : next.concern ? `${ids}-concern` : next.point ? `${ids}-loc` : `${ids}-notewrap`;
      const el = document.getElementById(first);
      el?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      (el?.querySelector('button, textarea') as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    const input = buildReportInput({ type, depth, congestion, severity, concern, impassable, point, note, observed, deviceId: deviceId || getDeviceId() });
    // Where the report came from labels and limits it; it is never evidence.
    input.origin = audience ? 'audience' : 'web';
    const parsed = ReportInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setErrors({ form: issue?.path[0] === 'congestion' ? t.report.errors.congestion : issue?.path[0] === 'description' ? t.report.errors.note : (issue?.message ?? t.report.errors.type) });
      return;
    }
    setPhase('sending');
    try {
      const res = await sendReport(scenarioId, parsed.data);
      const saved = res.receipt.outcome === 'off_map';
      setOffMap(saved);
      // The send button morphs into the success animation, then the sent state and the toast.
      finished.current = false;
      setPhase(reduced ? 'sent' : 'success');
      if (reduced) toast.success(saved ? t.report.sentOffMap : t.report.sent);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      const msg =
        code === 'NOT_ON_ROAD'
          ? t.report.errors.notOnRoad
          : code === 'RATE_LIMITED'
            ? t.report.errors.rateLimited
            : code === 'NETWORK'
              ? t.report.errors.network
              : t.report.errors.generic(describeApiError(err));
      setErrors(code === 'NOT_ON_ROAD' ? { point: msg } : { form: msg });
      setPhase('form');
    }
  }

  // Lottie completion and the fallback timer both land here; only the first one counts.
  const finished = useRef(false);
  function finishSuccess() {
    if (finished.current) return;
    finished.current = true;
    setPhase('sent');
    toast.success(offMap ? t.report.sentOffMap : t.report.sent);
  }

  useEffect(() => {
    if (phase !== 'success') return;
    const timer = setTimeout(finishSuccess, 1400);
    return () => clearTimeout(timer);
     
  }, [phase]);

  function reset() {
    setType(null);
    setDepth(null);
    setCongestion(null);
    setSeverity(null);
    setImpassable(false);
    setNote('');
    setObserved(false);
    setErrors({});
    setOffMap(false);
    setPhase('form');
  }

  if (phase === 'sent') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 px-6 py-16 text-center" role="status">
        <LottiePlayer data={successAnimation} className="size-36" />
        <p className="text-title font-semibold text-ink">{offMap ? t.report.sentOffMap : t.report.sent}</p>
        <button type="button" onClick={reset} className="vw-press mt-2 inline-flex min-h-14 items-center justify-center rounded-button border border-control-border bg-panel-raised px-6 text-body font-semibold text-ink">
          {t.report.another}
        </button>
      </motion.div>
    );
  }

  const types = REPORT_TYPES;
  const fieldErrors = (['type', 'congestion', 'description', 'point'] as const).filter((k) => errors[k]).length;
  // The detail step (depth, severity, ...) takes number 2 when the type has one; the rest follow it.
  const hasDetail = type === 'flood' || type === 'congestion' || type === 'debris' || type === 'accident' || type === 'walking_concern';
  const locIndex = hasDetail ? 3 : 2;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6 px-4 pt-1">
      {audience && (
        <p data-testid="audience-note" className="-mb-3 rounded-card border border-control-border bg-panel-sunken px-4 py-2.5 text-meta font-semibold text-ink">
          {t.report.audienceNote}
        </p>
      )}
      <p className="text-body text-ink-muted">{t.report.intro}</p>

      <Step index={1} label={t.report.typeLabel} error={errors.type} id={`${ids}-type`} bare>
        <div role="radiogroup" aria-label={t.report.typeLabel} className="grid grid-cols-2 gap-2">
          {types.map((kind) => {
            const on = type === kind;
            return (
              <motion.button
                key={kind}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`type-${kind}`}
                whileTap={{ scale: motionTokens.buttonPressScale }}
                onClick={() => {
                  setType(kind);
                  setErrors((e) => ({ ...e, type: undefined, congestion: undefined, concern: undefined }));
                  setConcern(null);
                }}
                className={cn(
                  // Always 2 px, so picking a card never nudges its neighbours. The picked one is the deep brand surface with a lime edge.
                  'relative flex min-h-[4.5rem] items-center gap-2.5 rounded-sheet border-2 px-2.5 py-3 text-left transition-colors',
                  on ? 'border-accent bg-chrome-bg text-chrome-ink' : errors.type ? 'border-danger bg-panel text-ink' : 'border-panel-line bg-panel text-ink shadow-sm',
                )}
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', on ? 'bg-white' : 'bg-panel-sunken')}>
                  <img src={`/report/${kind}.png`} alt="" width={28} height={28} draggable={false} className="size-7 object-contain" />
                </span>
                <span className="min-w-0 flex-1 text-body leading-tight font-semibold">{t.report.types[kind]}</span>
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={snappy} className="absolute top-1.5 right-1.5 grid size-[18px] place-items-center rounded-full bg-accent text-on-accent">
                    <Check aria-hidden className="size-3" strokeWidth={3.5} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </Step>

      <AnimatePresence mode="popLayout" initial={false}>
        {type === 'flood' && (
          <motion.div key="depth" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Step index={2} label={t.report.depthLabel} id={`${ids}-depth`}>
              <div className="flex items-stretch gap-4">
                <DepthFigure depth={depth} />
                <LayoutGroup id="depth">
                  <div className="flex flex-1 flex-col-reverse justify-between gap-1.5">
                    {(['ankle', 'knee', 'waist', 'unknown'] as const).map((d) => {
                      const on = depth === d;
                      return (
                        <motion.button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          whileTap={{ scale: motionTokens.buttonPressScale }}
                          onClick={() => setDepth(d)}
                          className={cn('relative flex min-h-10 items-center justify-between rounded-button px-4 text-body font-semibold', on ? 'text-on-accent' : 'bg-panel-sunken text-ink', d === 'unknown' && 'order-first')}
                        >
                          {on && <motion.span layoutId="depth-bg" className="absolute inset-0 rounded-button bg-accent" transition={snappy} />}
                          <span className="relative">{t.report.depths[d]}</span>
                          {d !== 'unknown' && <span aria-hidden className={cn('relative h-1 rounded-chip', on ? 'bg-on-accent' : 'bg-flood-prone')} style={{ width: `${8 + WATER[d] * 40}px` }} />}
                        </motion.button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>
            </Step>
          </motion.div>
        )}

        {type === 'congestion' && (
          <motion.div key="cong" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Step index={2} label={t.report.congestionLabel} error={errors.congestion} id={`${ids}-cong`}>
              <Segmented
                id="congestion"
                options={['moderate', 'heavy', 'standstill'] as const}
                value={congestion}
                labels={t.report.congestion}
                onChange={(c) => {
                  setCongestion(c);
                  setErrors((e) => ({ ...e, congestion: undefined }));
                }}
              />
            </Step>
          </motion.div>
        )}

        {type === 'walking_concern' && (
          <motion.div key="concern" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Step index={2} label={t.report.concernLabel} error={errors.concern} id={`${ids}-concern`}>
              <Segmented
                id="concern"
                options={['poorly_lit', 'isolated'] as const}
                value={concern}
                labels={t.report.concern}
                onChange={(c) => {
                  setConcern(c);
                  setErrors((e) => ({ ...e, concern: undefined }));
                }}
              />
              <p className="text-meta text-ink-muted">{t.report.concernHint}</p>
            </Step>
          </motion.div>
        )}

        {(type === 'debris' || type === 'accident') && (
          <motion.div key="sev" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Step index={2} label={t.report.severityLabel} id={`${ids}-sev`}>
              <Segmented id="severity" options={['low', 'medium', 'high'] as const} value={severity} labels={t.report.severity} onChange={setSeverity} />
              <Switch checked={impassable} onChange={setImpassable} label={t.report.impassable} />
            </Step>
          </motion.div>
        )}
      </AnimatePresence>

      <Step index={locIndex} label={t.report.locationLabel} error={errors.point} id={`${ids}-loc`} bare>
        <div className={cn('overflow-hidden rounded-card border bg-panel shadow-sm', errors.point ? 'border-2 border-danger' : 'border-panel-line')}>
          <div className="relative h-64">
            {graph ? (
              <MapPanel
                scene={graph.scene}
                compact
                pick={point}
                onPick={(p) => {
                  setPoint(p);
                  setErrors((e) => ({ ...e, point: undefined }));
                }}
              />
            ) : (
              <div role="status" className="grid size-full place-items-center bg-panel-sunken text-meta text-ink-muted">
                {t.map.loading}
              </div>
            )}
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className="vw-press absolute top-2 right-2 z-30 inline-flex h-11 items-center gap-2 rounded-button border border-panel-line bg-panel px-3.5 text-meta font-semibold text-ink shadow-md disabled:opacity-60"
            >
              <LocateFixed aria-hidden className="size-4" />
              {locating ? t.report.locating : t.report.useLocation}
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-chip', point ? 'bg-accent text-on-accent' : 'bg-panel-sunken text-ink-muted')}>
              <MapPin aria-hidden className="size-4.5" />
            </span>
            <div className="min-w-0 text-meta">
              {point ? (
                <>
                  <p className="tech text-ink">{t.report.pinAt(point.lat.toFixed(5), point.lng.toFixed(5))}</p>
                  {nearest && nearest.distanceM <= NOT_ON_ROAD_M ? (
                    <p className="text-ink-muted">{t.report.nearestRoad(nearestName, Math.round(nearest.distanceM))}</p>
                  ) : (
                    nearest && <p className="font-semibold text-warn-ink">{liveScenario ? t.report.farFromRoadLive : t.report.farFromRoad}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-ink">{t.report.noPin}</p>
                  <p className="text-ink-muted">{t.report.tapMap}</p>
                </>
              )}
            </div>
          </div>
        </div>
        {locationMsg && <p className="text-body text-warn-ink">{locationMsg}</p>}
      </Step>

      {type !== 'walking_concern' && (
        <Step index={locIndex + 1} label={t.report.noteLabel} id={`${ids}-notewrap`}>
          <textarea
            id={`${ids}-note`}
            aria-label={t.report.noteLabel}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t.report.notePlaceholder}
            aria-invalid={noteTooLong || undefined}
            className={cn(
              'min-h-24 w-full resize-none rounded-card border-2 bg-transparent p-2 text-body text-ink outline-none placeholder:text-ink-muted',
              noteTooLong ? 'border-danger' : 'border-transparent focus:border-focus',
            )}
          />
          <div className="flex items-center gap-3">
            <span className="h-1 flex-1 overflow-hidden rounded-chip bg-panel-line">
              <motion.span
                className={cn('block h-full w-full origin-left rounded-chip', noteTooLong ? 'bg-danger' : 'bg-ink-muted')}
                animate={{ scaleX: Math.min(1, noteLen / REPORT_DESCRIPTION_MAX) }}
                transition={{ duration: 0.2 }}
              />
            </span>
            <p className={cn('text-meta tabular', noteTooLong ? 'font-semibold text-danger-ink' : 'text-ink-muted')}>{t.report.counter(noteLen, REPORT_DESCRIPTION_MAX)}</p>
          </div>
          {errors.description && (
            <p role="alert" className="flex items-center gap-2 text-body font-semibold text-danger-ink">
              <CircleAlert aria-hidden className="size-4.5 shrink-0" />
              {errors.description}
            </p>
          )}
        </Step>
      )}

      <div className="flex items-center gap-3 rounded-card border border-panel-line bg-panel px-4 py-1 shadow-sm">
        <Eye aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <Switch checked={observed} onChange={setObserved} label={t.report.observed} />
        </div>
      </div>
      <p className="-mt-3 px-1 text-meta text-ink-muted">{t.report.deviceNote}</p>

      {errors.form && (
        <p role="alert" className="flex items-start gap-2.5 rounded-card border border-danger bg-danger-surface p-4 text-body font-semibold text-danger-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4.5 shrink-0" />
          {errors.form}
        </p>
      )}

      <div className="sticky bottom-0 z-40 -mx-4 flex flex-col items-center gap-2 rounded-t-sheet border border-b-0 border-panel-line bg-panel px-4 pt-3 pb-[max(var(--vw-space-md),env(safe-area-inset-bottom))] shadow-lg">
        {fieldErrors > 0 && (
          <p className="flex w-full items-center gap-2 text-meta font-semibold text-danger-ink">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            {t.report.errors.summary(fieldErrors)}
          </p>
        )}
        <motion.button
          type="submit"
          layout
          disabled={phase !== 'form'}
          transition={soft}
          whileTap={phase === 'form' ? { scale: motionTokens.buttonPressScale } : undefined}
          className={cn(
            'relative flex min-h-14 items-center justify-center gap-2 overflow-hidden text-title font-semibold',
            phase === 'success' ? 'size-16 rounded-chip bg-positive text-white' : 'w-full rounded-button bg-accent text-on-accent',
          )}
        >
          {phase === 'success' ? (
            <LottiePlayer data={successAnimation} className="size-16" onComplete={finishSuccess} />
          ) : (
            <>
              <Send aria-hidden className="size-5" />
              {phase === 'sending' ? t.report.sending : t.report.send}
            </>
          )}
        </motion.button>
      </div>
    </form>
  );
}
