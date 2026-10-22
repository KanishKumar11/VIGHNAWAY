'use client';

import type { CongestionLevel, Depth, LatLng, ReportInput, ReportType, Severity } from '@vighnaway/contracts';
import { REPORT_DESCRIPTION_MAX, REPORT_TYPES, ReportInputSchema } from '@vighnaway/contracts';
import { snapToEdge } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import successAnimation from '@vighnaway/tokens/lottie/success.json';
import { CircleAlert, CircleCheck, LocateFixed, MapPin, Send } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { sendReport } from '@/lib/sendReport';
import { cn } from '@/lib/cn';
import { buildScene } from '@/lib/scene';
import { graphFor, GRAPH_FILE, SCENARIO_ID } from '@/lib/scenario';
import { getDeviceId } from '@/lib/storage';
import { tripEnv } from '@/hooks/useDemoTrip';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MapPanel } from '@/components/map/MapPanel';
import { IncidentGlyph } from '@/components/shared/IncidentGlyph';
import { LottiePlayer } from '@/components/motion/LottiePlayer';
import { toast } from '@/components/ui/toast';

const NOT_ON_ROAD_M = 30;
type DepthChoice = Depth | 'unknown';
type FieldErrors = Partial<Record<'type' | 'congestion' | 'description' | 'point' | 'form', string>>;
const snappy = { type: 'spring' as const, ...motionTokens.springSnappy };
const soft = { type: 'spring' as const, ...motionTokens.springSoft };

/** Water level on the figure, as a fraction of its height from the feet. */
const WATER: Record<DepthChoice, number> = { ankle: 0.12, knee: 0.32, waist: 0.56, unknown: 0 };

/** Visual depth selector: a standing figure with the water rising to the chosen level. */
function DepthFigure({ depth }: { depth: DepthChoice | null }) {
  const level = depth ? WATER[depth] : 0;
  const top = 150 - level * 132;
  return (
    <svg viewBox="0 0 120 160" className="h-44 w-32" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={4} width={112} height={152} rx={16} className="fill-panel-sunken" />
      <g className="stroke-ink" strokeWidth={4}>
        <circle cx={60} cy={30} r={10} />
        <path d="M60 42v46M60 54l-20 22M60 54l20 22M60 88l-15 54M60 88l15 54" />
      </g>
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

function Section({ eyebrow, label, error, children, id }: { eyebrow: string; label: string; error?: string; children: ReactNode; id: string }) {
  return (
    <fieldset id={id} className="flex scroll-mt-6 flex-col gap-3" aria-describedby={error ? `${id}-err` : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-3 flex flex-col gap-0.5">
        <span className="text-meta font-medium text-ink-muted">{eyebrow}</span>
        <span className="text-title font-semibold text-ink">{label}</span>
      </legend>
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-err`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="-mt-2 flex items-center gap-2 text-body font-semibold text-danger-ink"
          >
            <CircleAlert aria-hidden className="size-4.5 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {children}
    </fieldset>
  );
}

/** Builds the request body; only fields that apply to the type are sent. */
export function buildReportInput(f: {
  type: ReportType;
  depth: DepthChoice | null;
  congestion: CongestionLevel | null;
  severity: Severity | null;
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
  const note = f.note.trim();
  if (note) input.description = note;
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
  const [impassable, setImpassable] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [note, setNote] = useState('');
  const [observed, setObserved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>('form');
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  useEffect(() => setDeviceId(getDeviceId()), []);

  const scene = useMemo(() => ({ ...buildScene(tripEnv(scenarioId), GRAPH_FILE, null, { phase: 'idle', flashOn: false, change: null }), origin: null }), [scenarioId]);
  const nearest = useMemo(() => (point ? snapToEdge(graphFor('foot'), point) : null), [point]);
  const nearestName = nearest ? (graphFor('foot').edges[graphFor('foot').edgeIndex.get(nearest.edgeId)!]?.name ?? '') : '';
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
    if (noteTooLong) next.description = t.report.errors.note;
    if (!point) next.point = t.report.errors.location;
    setErrors(next);
    if (Object.keys(next).length || !type || !point) {
      // Take the person to the first thing to fix.
      const first = next.type ? `${ids}-type` : next.congestion ? `${ids}-cong` : next.point ? `${ids}-loc` : `${ids}-notewrap`;
      const el = document.getElementById(first);
      el?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      (el?.querySelector('button, textarea') as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    const input = buildReportInput({ type, depth, congestion, severity, impassable, point, note, observed, deviceId: deviceId || getDeviceId() });
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
      await sendReport(scenarioId, parsed.data);
      // The send button morphs into the success animation, then the sent state and the toast.
      finished.current = false;
      setPhase(reduced ? 'sent' : 'success');
      if (reduced) toast.success(t.report.sent);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      const msg =
        code === 'NOT_ON_ROAD'
          ? t.report.errors.notOnRoad
          : code === 'RATE_LIMITED'
            ? t.report.errors.rateLimited
            : code === 'NETWORK'
              ? t.report.errors.network
              : t.report.errors.generic(err instanceof Error ? err.message : String(err));
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
    toast.success(t.report.sent);
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
    setPhase('form');
  }

  if (phase === 'sent') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 px-6 py-16 text-center" role="status">
        <LottiePlayer data={successAnimation} className="size-36" />
        <p className="text-title font-semibold text-ink">{t.report.sent}</p>
        <button type="button" onClick={reset} className="vw-press mt-2 inline-flex min-h-14 items-center justify-center rounded-button border border-control-border bg-panel-raised px-6 text-body font-semibold text-ink">
          {t.report.another}
        </button>
      </motion.div>
    );
  }

  const types = REPORT_TYPES;
  const fieldErrors = (['type', 'congestion', 'description', 'point'] as const).filter((k) => errors[k]).length;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-9 px-5 pt-6">
      {audience && (
        <p data-testid="audience-note" className="-mb-3 rounded-card border border-control-border bg-panel-sunken px-4 py-2.5 text-meta font-semibold text-ink">
          {t.report.audienceNote}
        </p>
      )}
      <p className="text-body text-ink-muted">{t.report.intro}</p>

      <Section eyebrow={t.report.step(1, 3)} label={t.report.typeLabel} error={errors.type} id={`${ids}-type`}>
        <LayoutGroup id="types">
          <div className="grid grid-cols-3 gap-2.5">
            {types.map((kind) => {
              const on = type === kind;
              return (
                <motion.button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  whileTap={{ scale: motionTokens.buttonPressScale }}
                  onClick={() => {
                    setType(kind);
                    setErrors((e) => ({ ...e, type: undefined, congestion: undefined }));
                  }}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-card border p-2 text-center text-meta font-semibold text-ink',
                    on ? 'border-transparent' : errors.type ? 'border-danger bg-panel-raised' : 'border-control-border bg-panel-raised',
                  )}
                >
                  {on && <motion.span layoutId="type-bg" className="absolute inset-0 rounded-card border-2 border-accent bg-recommended-surface" transition={snappy} />}
                  <span className={cn('relative flex size-11 items-center justify-center rounded-chip', on ? 'bg-accent text-on-accent' : kind === 'road_clear' ? 'bg-positive-soft text-positive-ink' : 'bg-panel-sunken text-ink')}>
                    {kind === 'road_clear' ? <CircleCheck aria-hidden className="size-6" /> : <IncidentGlyph type={kind} className="size-6" />}
                  </span>
                  <span className={cn('relative leading-tight', on && 'text-recommended-ink')}>{t.report.types[kind]}</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </Section>

      <AnimatePresence mode="popLayout" initial={false}>
        {type === 'flood' && (
          <motion.div key="depth" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Section eyebrow={t.report.detailEyebrow} label={t.report.depthLabel} id={`${ids}-depth`}>
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
            </Section>
          </motion.div>
        )}

        {type === 'congestion' && (
          <motion.div key="cong" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Section eyebrow={t.report.detailEyebrow} label={t.report.congestionLabel} error={errors.congestion} id={`${ids}-cong`}>
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
            </Section>
          </motion.div>
        )}

        {(type === 'debris' || type === 'accident') && (
          <motion.div key="sev" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Section eyebrow={t.report.detailEyebrow} label={t.report.severityLabel} id={`${ids}-sev`}>
              <Segmented id="severity" options={['low', 'medium', 'high'] as const} value={severity} labels={t.report.severity} onChange={setSeverity} />
              <Switch checked={impassable} onChange={setImpassable} label={t.report.impassable} />
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      <Section eyebrow={t.report.step(2, 3)} label={t.report.locationLabel} error={errors.point} id={`${ids}-loc`}>
        <div className={cn('overflow-hidden rounded-card border bg-panel-raised', errors.point ? 'border-2 border-danger' : 'border-control-border')}>
          <div className="relative h-64">
            <MapPanel
              scene={scene}
              compact
              pick={point}
              onPick={(p) => {
                setPoint(p);
                setErrors((e) => ({ ...e, point: undefined }));
              }}
            />
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className="vw-press absolute top-2 right-2 z-30 inline-flex h-10 items-center gap-2 rounded-button border border-control-border bg-panel-raised px-3.5 text-meta font-semibold text-ink disabled:opacity-60"
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
                    nearest && <p className="font-semibold text-warn-ink">{t.report.farFromRoad}</p>
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
      </Section>

      <div id={`${ids}-notewrap`} className="flex flex-col gap-2">
        <label htmlFor={`${ids}-note`} className="flex flex-col gap-0.5">
          <span className="text-meta font-medium text-ink-muted">{t.report.step(3, 3)}</span>
          <span className="text-title font-semibold text-ink">{t.report.noteLabel}</span>
        </label>
        <textarea
          id={`${ids}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t.report.notePlaceholder}
          aria-invalid={noteTooLong || undefined}
          className={cn(
            'mt-1 rounded-card border bg-panel-raised p-4 text-body text-ink outline-none placeholder:text-ink-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus',
            noteTooLong ? 'border-2 border-danger' : 'border-control-border',
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
      </div>

      <div className="flex flex-col gap-1 rounded-card bg-panel-sunken px-4 py-2">
        <Switch checked={observed} onChange={setObserved} label={t.report.observed} />
      </div>
      <p className="-mt-6 text-meta text-ink-muted">{t.report.deviceNote}</p>

      {errors.form && (
        <p role="alert" className="flex items-start gap-2.5 rounded-card border border-danger bg-danger-surface p-4 text-body font-semibold text-danger-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4.5 shrink-0" />
          {errors.form}
        </p>
      )}

      <div className="sticky bottom-0 z-40 -mx-5 flex flex-col items-center gap-2 border-t border-panel-line bg-panel px-5 pt-3 pb-[max(var(--vw-space-md),env(safe-area-inset-bottom))]">
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
