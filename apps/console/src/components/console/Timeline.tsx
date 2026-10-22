'use client';

import type { SimAction } from '@vighnaway/contracts';
import { formatSimClock } from '@vighnaway/contracts';
import { motion as motionTokens } from '@vighnaway/tokens';
import {
  Activity,
  History,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  StepForward,
  TrafficCone,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { isLiveScenario } from '@/lib/scenario';
import { activeScenario, useActiveScenario } from '@/stores/scenario';
import { feedLine, useFeedStatus } from '@/hooks/useFeedStatus';
import {
  clusterTicks,
  pctAt,
  timelineSpan,
  timelineTicks,
  type TimelineSpan,
  type TimelineTick,
} from '@/lib/timeline';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { usePrefs } from '@/stores/prefs';
import { useReplay } from '@/stores/replay';
import { useSimAction } from '@/hooks/useOperatorActions';
import { IncidentGlyph } from '@/components/shared/IncidentGlyph';

const clock = (s: number) => formatSimClock(activeScenario().clockStartsAt, s);

/** Releasing the playhead this close to the live moment (share of the track) goes back to live. */
export const SNAP_TO_LIVE = 0.015;

/** Where a drag lands: clamped to what has happened, or null to go back to live. */
export function scrubTarget(fraction: number, span: TimelineSpan, liveS: number): number | null {
  const atS = Math.round(
    span.startS + Math.max(0, Math.min(1, fraction)) * (span.endS - span.startS),
  );
  if (atS >= liveS - SNAP_TO_LIVE * (span.endS - span.startS)) return null;
  return Math.max(0, Math.min(liveS, atS));
}

function TickGlyph({ tick, passed }: { tick: TimelineTick; passed: boolean }) {
  return (
    <span
      className={cn(
        'flex size-7 items-center justify-center rounded-chip border shadow-sm transition-colors duration-300',
        passed
          ? 'border-brand-from/30 bg-brand-from/10 text-brand-from'
          : 'border-shell-line bg-shell-raised text-ink-on-shell-muted',
      )}
    >
      {tick.kind === 'report' && tick.type && tick.type !== 'road_clear' ? (
        <IncidentGlyph type={tick.type} className="size-3.5" />
      ) : (
        <ShieldCheck aria-hidden className="size-3.5" />
      )}
    </span>
  );
}

/** Loads the run's history once per scrub, so replay always reflects the server's record. */
function useHistoryLoader() {
  const scenarioId = useActiveScenario().id;
  const loading = useRef<Promise<void> | null>(null);
  return useCallback(() => {
    if (loading.current) return loading.current;
    loading.current = api
      .history(scenarioId)
      .then((h) => useReplay.getState().setEntries(h.runId, h.entries))
      .catch(() => undefined)
      .finally(() => {
        loading.current = null;
      });
    return loading.current;
  }, [scenarioId]);
}

/**
 * The scenario timeline: scripted events as ticks, the live playhead, and decision replay. Dragging
 * the playhead back rebuilds the decision at that moment (read-only); releasing at the live end,
 * End or "Back to live" returns.
 */
function Scrubber({ replayAtS }: { replayAtS: number | null }) {
  const liveS = useLiveStore((s) => s.simTimeS);
  const scenario = useActiveScenario();
  const span = useMemo(() => timelineSpan(scenario.events), [scenario]);
  const clusters = useMemo(
    () => clusterTicks(timelineTicks(scenario.events, span), 3.5),
    [scenario, span],
  );
  const shownS = replayAtS ?? liveS;
  const pct = pctAt(shownS, span);
  const livePct = pctAt(liveS, span);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const load = useHistoryLoader();

  const seekFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const at = scrubTarget((clientX - r.left) / r.width, span, liveS);
    if (at === null) useReplay.getState().exit();
    else useReplay.getState().seek(at);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (liveS <= 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    void load();
    seekFrom(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekFrom(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 60 : 10;
    const from = replayAtS ?? liveS;
    let next: number | null | undefined;
    if (e.key === 'ArrowLeft') next = Math.max(0, from - step);
    else if (e.key === 'ArrowRight') next = from + step >= liveS ? null : from + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End' || e.key === 'Escape') next = null;
    if (next === undefined) return;
    e.preventDefault();
    if (next === null) useReplay.getState().exit();
    else {
      void load();
      useReplay.getState().seek(next);
    }
  };

  return (
    <div className="relative h-17">
      <ol className="absolute inset-0" aria-label={t.sim.timelineLabel}>
        {clusters.map((c, i) => {
          const passed = c.ticks.every((tick) => tick.atS <= shownS);
          return (
            <li
              key={c.key}
              className="absolute -top-0.5 flex -translate-x-3.5 flex-col items-start"
              style={{ left: `${c.pct}%` }}
            >
              <span className="flex gap-0.5">
                {c.ticks.map((tick) => (
                  <span key={tick.id} title={tick.label}>
                    <span className="sr-only">{t.sim.tickLabel(clock(tick.atS), tick.label)}</span>
                    <TickGlyph tick={tick} passed={tick.atS <= shownS} />
                  </span>
                ))}
              </span>
              <span
                aria-hidden
                className={cn(
                  'tech mt-5.5 -ml-1.5 rounded-chip px-1.5 py-0.5',
                  passed ? 'bg-panel-sunken text-ink-on-shell' : 'text-ink-on-shell-muted',
                  i > 0 && i < clusters.length - 1 && 'max-[1599px]:hidden',
                )}
              >
                {clock(c.atS)}
              </span>
            </li>
          );
        })}
      </ol>
      {/* Track: what has happened is solid; a replayed moment shows how far back it is. */}
      <div
        ref={track}
        aria-hidden
        className="absolute inset-x-0 top-9 h-1.5 rounded-chip bg-shell-line"
      >
        <div
          className="vw-playhead absolute inset-y-0 left-0 w-full origin-left rounded-chip bg-linear-to-r from-brand-from via-brand-via to-brand-to"
          style={{ transform: `scaleX(${livePct / 100})` }}
        />
        {replayAtS !== null && (
          <span
            className="absolute -top-1.5 h-4 w-0.5 rounded-chip bg-ink-on-shell-muted"
            style={{ left: `${livePct}%` }}
          />
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t.replay.scrubLabel}
        aria-valuemin={0}
        aria-valuemax={Math.round(liveS)}
        aria-valuenow={Math.round(shownS)}
        aria-valuetext={replayAtS !== null ? t.replay.replaying(clock(replayAtS)) : clock(liveS)}
        title={t.replay.hint}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="absolute inset-x-0 top-6 h-7 cursor-ew-resize touch-none rounded-chip"
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-full',
          replayAtS === null && 'vw-playhead',
        )}
        style={{ transform: `translateX(${pct}%)` }}
      >
        <span
          className={cn(
            'absolute top-[calc(var(--spacing)*7.75)] -left-2.5 size-5 rounded-chip border-4 bg-shell-raised shadow-md',
            replayAtS === null
              ? 'border-route-recommended shadow-glow-teal'
              : 'border-ink-on-shell',
          )}
        />
      </div>
    </div>
  );
}

function Ticker() {
  const items = useLiveStore((s) => s.ticker);
  return (
    <div className="flex min-w-0 items-center gap-4" aria-label={t.ticker.title}>
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip border border-shell-line bg-panel-sunken px-2.5 text-meta font-semibold text-ink-on-shell">
        <Activity aria-hidden className="size-3.5 text-brand-from" />
        {t.ticker.title}
      </span>
      {items.length === 0 ? (
        <span className="truncate text-meta text-ink-on-shell-muted">{t.ticker.empty}</span>
      ) : (
        <ol className="flex min-w-0 flex-1 gap-6 overflow-hidden" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {items.slice(0, 3).map((item, i) => (
              <motion.li
                key={item.key}
                layout="position"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'flex min-w-0 items-center gap-2 text-meta',
                  i === 0
                    ? 'max-w-[48%] shrink-0 text-ink-on-shell'
                    : 'flex-1 text-ink-on-shell-muted',
                )}
              >
                <span
                  className={cn(
                    'tech shrink-0 rounded-chip px-1.5 py-0.5',
                    i === 0 ? 'bg-brand-from/10 text-brand-from' : 'bg-panel-sunken',
                  )}
                >
                  {clock(item.atS)}
                </span>
                <span className="truncate">{item.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

const ghost =
  'vw-press ctl-quiet h-full justify-center px-3.5 text-body font-semibold whitespace-nowrap disabled:opacity-40 max-[1599px]:w-10 max-[1599px]:px-0';
/** Transport labels collapse to icons on narrow screens so the scrubber keeps its room. */
const LABEL = 'max-[1599px]:sr-only';

/** Live mode: no simulation to drive; the feed's state and the ticker take the bar. */
function LiveBar() {
  const scenario = useActiveScenario();
  const nowS = useLiveStore((s) => s.simTimeS);
  const feed = useFeedStatus(scenario.id, true);
  const line = feedLine(feed.data ?? null, nowS);
  return (
    <footer
      className="panel-card grid shrink-0 grid-cols-[minmax(0,22rem)_1fr] items-center gap-x-8 px-6 py-4"
      aria-label={t.feed.title}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-button',
            line.tone === 'error'
              ? 'bg-warn-surface text-warn-ink'
              : 'bg-panel-sunken text-ink-on-shell',
          )}
        >
          <TrafficCone aria-hidden className="size-5" />
        </span>
        <div className="min-w-0" role="status">
          <p className="flex items-center gap-2 text-body font-semibold text-ink-on-shell">
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-chip',
                line.tone === 'ok'
                  ? 'bg-live'
                  : line.tone === 'error'
                    ? 'bg-warn'
                    : 'bg-ink-on-shell-muted',
              )}
            />
            {line.text}
          </p>
          <p className="mt-0.5 text-meta text-ink-on-shell-muted">
            {feed.data?.enabled
              ? `${t.feed.active(feed.data.activeIncidents)} · ${feed.data.attribution}`
              : t.feed.noControls}
          </p>
          <p className="text-meta text-ink-on-shell-muted">{t.feed.reportsNote}</p>
        </div>
      </div>
      <Ticker />
    </footer>
  );
}

/** The timeline under the map (DESIGN_VISION section 10): transport, scenario time, replay, latest changes. */
export function Timeline({ replayAtS = null }: { replayAtS?: number | null }) {
  const live = isLiveScenario(useActiveScenario());
  return live ? <LiveBar /> : <SimTimeline replayAtS={replayAtS} />;
}

function SimTimeline({ replayAtS }: { replayAtS: number | null }) {
  const sim = useLiveStore((s) => s.sim);
  const token = useOperator((s) => s.token);
  const openDialog = useOperator((s) => s.openDialog);
  const presenter = usePrefs((s) => s.presenter);
  const action = useSimAction();
  const replaying = replayAtS !== null;
  const run = (a: SimAction) => (token ? action.mutate(a) : openDialog());
  const playing = sim?.state === 'playing';
  const busy = action.isPending || replaying;
  const finished = sim?.state === 'finished';
  const showTransport = !presenter;

  const status = (
    <p
      id="sim-title"
      className="flex w-0 min-w-full items-center gap-2 text-meta text-ink-on-shell-muted"
    >
      <span className="sr-only">{t.sim.title}: </span>
      {replaying ? (
        <History aria-hidden className="size-3.5 shrink-0" />
      ) : !token ? (
        <Lock aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-chip ring-3',
            sim?.state === 'playing'
              ? 'bg-positive ring-positive/20'
              : sim?.state === 'finished'
                ? 'bg-resolved ring-resolved/20'
                : 'bg-warn ring-warn/20',
          )}
        />
      )}
      <span className="line-clamp-2">
        {replaying
          ? t.replay.readOnly
          : !token
            ? t.sim.needsToken
            : sim
              ? `${t.sim.states[sim.state]} · ${t.sim.events(sim.nextEventIndex, sim.eventCount)} · ${t.sim.speed(sim.simSecondsPerRealSecond)}`
              : t.sim.noServer}
      </span>
    </p>
  );

  /*
   * Two rows on one grid, so everything lines up: row 1 holds the transport and the scrubber (the
   * transport is nudged to the track's height), row 2 the status line and the latest changes, which
   * share a baseline. Without transport (presenter mode) the scrubber and ticker fill the card.
   */
  return (
    <footer
      className={cn(
        'panel-card grid shrink-0 items-center gap-x-8 gap-y-1 px-5 py-4',
        showTransport ? 'grid-cols-[minmax(14rem,auto)_minmax(0,1fr)]' : 'grid-cols-1',
      )}
      aria-labelledby="sim-title"
    >
      {showTransport && (
        <div className="flex items-center gap-2 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: motionTokens.buttonPressScale }}
            onClick={() => run(playing ? 'pause' : 'play')}
            disabled={busy || finished}
            aria-label={playing ? t.sim.pause : t.sim.play}
            className="ctl-primary h-11 px-5 text-body whitespace-nowrap disabled:opacity-40 max-[1599px]:w-11 max-[1599px]:px-0"
          >
            {playing ? (
              <Pause aria-hidden className="size-4.5 fill-current" />
            ) : (
              <Play aria-hidden className="size-4.5 fill-current" />
            )}
            <span className={LABEL}>{playing ? t.sim.pause : t.sim.play}</span>
          </motion.button>
          <div className="flex h-11 items-center gap-0.5 rounded-button border border-shell-line bg-shell-raised p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => run('step')}
              disabled={busy || playing || finished}
              aria-label={t.sim.step}
              className={ghost}
            >
              <StepForward aria-hidden className="size-4.5" />
              <span className={LABEL}>{t.sim.step}</span>
            </button>
            <button
              type="button"
              onClick={() => run('reset')}
              disabled={busy}
              aria-label={t.sim.reset}
              className={ghost}
            >
              <RotateCcw aria-hidden className="size-4.5" />
              <span className={LABEL}>{t.sim.reset}</span>
            </button>
          </div>
        </div>
      )}
      <div className="min-w-0">
        <Scrubber replayAtS={replayAtS} />
      </div>
      {showTransport ? (
        status
      ) : (
        <span id="sim-title" className="sr-only">
          {t.sim.title}
        </span>
      )}
      <div className="min-w-0">
        <Ticker />
      </div>
    </footer>
  );
}
