'use client';

import { formatSimClock } from '@vighnaway/contracts';
import { alertContext } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import { BookOpen, Bug, Clock, CloudRain, History, Lock, LockOpen, Presentation, Radio, ServerCrash, TriangleAlert, Volume2, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { API_URL } from '@/lib/env';
import { isLiveScenario, LIVE_SCENARIO, SCENARIO } from '@/lib/scenario';
import { timezoneLabel } from '@/lib/timezone';
import { useActiveScenario, useScenarioStore } from '@/stores/scenario';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { usePrefs } from '@/stores/prefs';
import { SimulatedBadge } from '@/components/shared/EvidenceChips';
import { BrandMark } from '@/components/shared/BrandMark';
import { RollingText } from '@/components/motion/RollingText';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { ViewMenu } from '@/components/shared/ViewMenu';

/**
 * Width tiers for the command bar (nothing ever wraps; lower-priority items collapse instead):
 * below 1440px the wordmark, the connection word and nav labels are hidden; 1900px and up also
 * shows the clock's context (simulation label and rain alert) and the nav labels.
 */

/** Thin vertical rule between groups in the bar. */
function BarDivider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-shell-line" />;
}

/** Connection state: a still dot and, from 1440px, a word. Never a pulse; only a lost connection gets a surface. */
export function ConnectionPill() {
  const connection = useLiveStore((s) => s.connection);
  const live = connection === 'live';
  const lost = connection === 'reconnecting';
  const label = live ? t.connection.live : lost ? t.connection.reconnecting : t.connection.connecting;
  return (
    <span
      role="status"
      title={label}
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-button text-meta font-medium whitespace-nowrap max-[1439px]:w-9 min-[1440px]:px-2.5',
        lost ? 'bg-warn-surface text-warn-ink' : 'text-ink-on-shell-muted',
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-chip ring-3', live ? 'bg-positive ring-positive/20' : lost ? 'bg-warn ring-warn/20' : 'bg-ink-subtle ring-ink-subtle/20')} />
      <span className="max-[1439px]:sr-only">{label}</span>
    </span>
  );
}

/** "Live data": a neutral badge with an explicit label (no extra accent hue). */
export function LiveDataBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-chip border border-control-border bg-live-surface px-2 text-meta font-semibold whitespace-nowrap text-live-ink', className)}>
      <Radio aria-hidden className="size-3.5" />
      {t.app.liveData}
    </span>
  );
}

/** Simulated demo or live mode, with a sliding indicator. Live is offered only if the API has it. */
function ScenarioSwitch() {
  const id = useScenarioStore((s) => s.id);
  const available = useScenarioStore((s) => s.available);
  const setId = useScenarioStore((s) => s.setId);
  const options = [SCENARIO, LIVE_SCENARIO].filter((o) => o.id === id || o.id === SCENARIO.id || available?.includes(o.id));
  if (options.length < 2) return null;
  return (
    <LayoutGroup id="scenario-switch">
      <div role="radiogroup" aria-label={t.app.scenarioSwitch} className="flex h-9 shrink-0 rounded-button bg-panel-sunken p-0.5">
        {options.map((o) => {
          const on = o.id === id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setId(o.id)}
              className={cn('relative h-full rounded-[calc(var(--vw-radius-button)-2px)] px-3.5 text-meta font-medium whitespace-nowrap transition-colors', on ? 'text-ink' : 'text-ink-muted hover:text-ink')}
            >
              {on && (
                <motion.span
                  layoutId="scenario-pill"
                  className="absolute inset-0 rounded-[calc(var(--vw-radius-button)-2px)] border border-panel-line bg-panel-raised shadow-sm"
                  transition={{ type: 'spring', ...motionTokens.springSnappy }}
                />
              )}
              <span className="relative">{isLiveScenario(o) ? t.app.modes.live : t.app.modes.simulated}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** The clock is the bar's focal point; its context (what it is, the rain alert) joins from 1900px. */
function SimClock({ replayAtS }: { replayAtS: number | null }) {
  const scenario = useActiveScenario();
  const live = isLiveScenario(scenario);
  const liveS = useLiveStore((s) => s.simTimeS);
  const simTimeS = replayAtS ?? liveS;
  const rain = alertContext(scenario.alerts, scenario.hasAlertInformation, simTimeS).rainAlertActive;
  const alert = scenario.alerts.find((a) => a.kind === 'rain');
  return (
    <div className="vw-clock flex h-11 items-center gap-3 rounded-button px-4 whitespace-nowrap">
      {replayAtS !== null ? <History aria-hidden className="size-4 shrink-0 text-ink-on-shell-muted" /> : <Clock aria-hidden className="size-4 shrink-0 text-ink-on-shell-muted" />}
      <div className="flex items-baseline gap-1.5">
        <p className="font-mono text-console-title font-semibold text-ink-on-shell tabular" aria-label={t.sim.clockLabel}>
          <RollingText text={formatSimClock(scenario.clockStartsAt, simTimeS, true)} />
        </p>
        <span className="tech text-ink-on-shell-muted">{timezoneLabel(scenario.timezone, t.sim.tz)}</span>
      </div>
      <div className="hidden items-center gap-3 min-[1900px]:flex">
        <span aria-hidden className="h-5 w-px bg-shell-line" />
        <span className="text-meta font-medium text-ink-on-shell-muted">{replayAtS !== null ? t.replay.replaying('') : live ? t.sim.wallClock : t.sim.eyebrow}</span>
        {!live &&
          (scenario.hasAlertInformation && alert ? (
            <span title={`${alert.label} · ${alert.source} · ${t.app.simulated}`} className="inline-flex items-center gap-2 text-meta">
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-chip px-2 font-semibold',
                  rain ? 'bg-warn-surface text-warn-ink' : 'border border-shell-line text-ink-on-shell-muted',
                )}
              >
                <CloudRain aria-hidden className="size-3.5" />
                {rain ? t.sim.rainAlert : `${t.sim.rainAlert} (${t.sim.alertInactive})`}
              </span>
              <span className="text-ink-subtle">{t.app.simulated}</span>
            </span>
          ) : (
            <span className="text-meta text-ink-on-shell-muted">{t.sim.noAlertInfo}</span>
          ))}
      </div>
    </div>
  );
}

const NAV_LINK = 'ctl-quiet h-full shrink-0 justify-center gap-2 px-3 text-meta font-medium whitespace-nowrap max-[1899px]:w-9 max-[1899px]:px-0';
const BAR_GROUP = 'flex h-9 shrink-0 items-center gap-0.5';

/** Command bar (DESIGN_VISION section 10): identity, scenario, scenario time, status, view, operator. */
export function Header({ replayAtS = null }: { replayAtS?: number | null }) {
  const scenario = useActiveScenario();
  const ready = useScenarioStore((s) => s.ready);
  const switchable = useScenarioStore((s) => !!s.available?.includes(LIVE_SCENARIO.id));
  const live = isLiveScenario(scenario);
  const token = useOperator((s) => s.token);
  const openDialog = useOperator((s) => s.openDialog);
  const setToken = useOperator((s) => s.setToken);
  const presenter = usePrefs((s) => s.presenter);
  const speech = usePrefs((s) => s.speech);
  const setPref = usePrefs((s) => s.set);
  return (
    <header className="vw-header vw-chrome relative z-30 grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 px-5">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/console" className="flex shrink-0 items-center gap-2.5" aria-label={t.app.name}>
          <BrandMark className="size-8 shrink-0" />
          <span className="flex flex-col leading-tight max-[1439px]:hidden">
            <span className="text-body font-bold tracking-wordmark text-ink-on-shell">{t.app.name}</span>
            <span className="text-meta text-ink-on-shell-muted">{t.app.controlRoom}</span>
          </span>
        </Link>
        <BarDivider />
        {ready && (
          <>
            <ScenarioSwitch />
            {/* The switch already names the mode; a stand-alone label is only needed when there is no switch. */}
            {!switchable && (
              <>
                <span className="truncate text-body font-semibold text-ink-on-shell">{t.app.scenarioShort(scenario.name)}</span>
                {live ? <LiveDataBadge /> : <SimulatedBadge onShell />}
              </>
            )}
          </>
        )}
      </div>

      <SimClock replayAtS={replayAtS} />

      <div className="flex min-w-0 items-center justify-end gap-2">
        {presenter ? (
          <>
            {!speech && (
              <button type="button" onClick={() => setPref('speech', true)} className="vw-press ctl-quiet h-9 px-3 text-meta whitespace-nowrap">
                <Volume2 aria-hidden className="size-4" />
                {t.view.suggestSpeech}
              </button>
            )}
            <button type="button" onClick={() => setPref('presenter', false)} className="vw-press ctl h-9 shrink-0 px-3.5 text-meta whitespace-nowrap">
              <X aria-hidden className="size-4" />
              {t.view.exitPresenter}
            </button>
            <ThemeToggle className="size-9" />
          </>
        ) : (
          <>
            <nav className={BAR_GROUP}>
              <Link href="/rules" className={NAV_LINK} aria-label={t.nav.rules} title={t.nav.rules}>
                <BookOpen aria-hidden className="size-4" />
                <span className="max-[1899px]:hidden">{t.nav.rules}</span>
              </Link>
              <Link href="/debug" className={NAV_LINK} aria-label={t.nav.debug} title={t.nav.debug}>
                <Bug aria-hidden className="size-4" />
                <span className="max-[1899px]:hidden">{t.nav.debug}</span>
              </Link>
            </nav>
            <BarDivider />
            <ConnectionPill />
            <BarDivider />
            <div className={BAR_GROUP}>
              <button type="button" onClick={() => setPref('presenter', true)} aria-label={t.view.presenter} title={t.view.presenterHint} className="vw-press ctl-quiet h-full w-9 justify-center">
                <Presentation aria-hidden className="size-4" />
              </button>
              <ViewMenu compact bare />
              <ThemeToggle bare />
            </div>
            {token ? (
              <button type="button" onClick={() => setToken(null)} aria-label={t.operator.lock} title={t.operator.lock} className="vw-press ctl ml-2 h-9 shrink-0 px-3.5 text-meta whitespace-nowrap">
                <LockOpen aria-hidden className="size-4 text-positive-ink" />
                {t.operator.unlocked}
              </button>
            ) : (
              <button type="button" onClick={openDialog} className="vw-press ctl-primary ml-2 h-9 shrink-0 px-3.5 text-meta whitespace-nowrap">
                <Lock aria-hidden className="size-4" />
                {t.operator.locked}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}

/** Server and graph notices: compact, over the map. */
export function StatusBanners() {
  const scenario = useActiveScenario();
  const reachable = useLiveStore((s) => s.apiReachable);
  const serverGraph = useLiveStore((s) => s.serverGraphVersion);
  const mismatch = !!serverGraph && serverGraph !== scenario.graphVersion;
  return (
    <AnimatePresence>
      {reachable === false && (
        <motion.p
          key="api"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-auto flex items-center gap-2.5 rounded-button border border-warn bg-warn-surface px-4 py-2 text-body font-medium text-warn-ink shadow-md"
        >
          <ServerCrash aria-hidden className="size-4" />
          {t.connection.apiUnreachable(API_URL)}
        </motion.p>
      )}
      {mismatch && (
        <motion.p
          key="graph"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-auto flex items-center gap-2.5 rounded-button border border-danger bg-danger-surface px-4 py-2 text-body font-medium text-danger-ink shadow-md"
        >
          <TriangleAlert aria-hidden className="size-4" />
          {t.connection.graphMismatch(serverGraph!, scenario.graphVersion)}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
