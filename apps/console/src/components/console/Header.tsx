'use client';

import { formatSimClock } from '@vighnaway/contracts';
import { alertContext } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import { CloudRain, History, Lock, LockOpen, Presentation, Radio, ServerCrash, TriangleAlert, Volume2, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { API_URL } from '@/lib/env';
import { isLiveScenario, LIVE_SCENARIO, SCENARIO } from '@/lib/scenario';
import { useActiveScenario, useScenarioStore } from '@/stores/scenario';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { usePrefs } from '@/stores/prefs';
import { SimulatedBadge } from '@/components/shared/EvidenceChips';
import { BrandMark } from '@/components/shared/BrandMark';
import { RollingText } from '@/components/motion/RollingText';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { ViewMenu } from '@/components/shared/ViewMenu';

/** Connection state: a still dot and a word, never a pulse. */
export function ConnectionPill() {
  const connection = useLiveStore((s) => s.connection);
  const live = connection === 'live';
  const lost = connection === 'reconnecting';
  const label = live ? t.connection.live : lost ? t.connection.reconnecting : t.connection.connecting;
  return (
    <span role="status" className={cn('inline-flex h-10 items-center gap-2 px-1 text-body font-medium', lost ? 'text-warn-ink' : 'text-ink-on-shell')}>
      <span aria-hidden className={cn('size-2 rounded-chip', live ? 'bg-route-recommended' : lost ? 'bg-warn' : 'bg-ink-subtle')} />
      {label}
    </span>
  );
}

/** "Live data": a neutral badge with an explicit label (no extra accent hue). */
export function LiveDataBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-chip border border-control-border bg-live-surface px-2 text-meta font-semibold text-live-ink', className)}>
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
      <div role="radiogroup" aria-label={t.app.scenarioSwitch} className="flex rounded-button bg-panel-sunken p-0.5">
        {options.map((o) => {
          const on = o.id === id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setId(o.id)}
              className={cn('relative h-8 rounded-[calc(var(--vw-radius-button)-2px)] px-3 text-meta font-semibold transition-colors', on ? 'text-ink' : 'text-ink-muted hover:text-ink')}
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

function SimClock({ replayAtS }: { replayAtS: number | null }) {
  const scenario = useActiveScenario();
  const live = isLiveScenario(scenario);
  const liveS = useLiveStore((s) => s.simTimeS);
  const simTimeS = replayAtS ?? liveS;
  const rain = alertContext(scenario.alerts, scenario.hasAlertInformation, simTimeS).rainAlertActive;
  const alert = scenario.alerts.find((a) => a.kind === 'rain');
  return (
    <div className="flex items-center gap-5">
      <div className="flex items-baseline gap-2">
        {replayAtS !== null && <History aria-hidden className="size-5 self-center text-ink-on-shell-muted" />}
        <p className="font-mono text-console-title font-semibold text-ink-on-shell tabular" aria-label={t.sim.clockLabel}>
          <RollingText text={formatSimClock(scenario.clockStartsAt, simTimeS, true)} />
        </p>
        <span className="tech text-ink-on-shell-muted">{t.sim.tz}</span>
      </div>
      <span className="text-meta text-ink-on-shell-muted">{replayAtS !== null ? t.replay.replaying('') : live ? t.sim.wallClock : t.sim.eyebrow}</span>
      {!live &&
        (scenario.hasAlertInformation && alert ? (
          <span title={`${alert.label} · ${alert.source}`} className={cn('inline-flex items-center gap-1.5 text-meta font-medium', rain ? 'text-ink-on-shell' : 'text-ink-on-shell-muted')}>
            <CloudRain aria-hidden className="size-4 text-flood-prone-solid" />
            {rain ? t.sim.rainAlert : `${t.sim.rainAlert} (${t.sim.alertInactive})`}
            <span className="text-ink-on-shell-muted">· {t.app.simulated}</span>
          </span>
        ) : (
          <span className="text-meta text-ink-on-shell-muted">{t.sim.noAlertInfo}</span>
        ))}
    </div>
  );
}

/** Command strip (DESIGN_VISION section 10): identity, scenario, scenario time, status, view, operator. */
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
    <header className="relative z-30 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 border-b border-shell-line bg-shell-raised px-5">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/console" className="flex items-center gap-3" aria-label={t.app.name}>
          <BrandMark className="size-8 shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-body font-bold tracking-wordmark text-ink-on-shell">{t.app.name}</span>
            <span className="text-meta text-ink-on-shell-muted">{t.app.controlRoom}</span>
          </span>
        </Link>
        <span aria-hidden className="h-8 w-px bg-shell-line" />
        {ready && (
          <>
            <ScenarioSwitch />
            {switchable || live ? null : <span className="truncate text-body font-medium text-ink-on-shell">{t.app.scenarioShort(scenario.name)}</span>}
            {live ? <LiveDataBadge /> : <SimulatedBadge onShell />}
          </>
        )}
      </div>

      <SimClock replayAtS={replayAtS} />

      <div className="flex items-center justify-end gap-2">
        {presenter ? (
          <>
            {!speech && (
              <button type="button" onClick={() => setPref('speech', true)} className="vw-press inline-flex h-10 items-center gap-2 rounded-button px-3 text-meta font-medium text-ink-on-shell-muted hover:text-ink-on-shell">
                <Volume2 aria-hidden className="size-4" />
                {t.view.suggestSpeech}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPref('presenter', false)}
              className="vw-press inline-flex h-10 items-center gap-2 rounded-button border border-control-border px-3.5 text-body font-semibold text-ink-on-shell"
            >
              <X aria-hidden className="size-4" />
              {t.view.exitPresenter}
            </button>
          </>
        ) : (
          <>
            <nav className="flex items-center text-body text-ink-on-shell-muted">
              <Link href="/rules" className="rounded-button px-2.5 py-1.5 hover:text-ink-on-shell">
                {t.nav.rules}
              </Link>
              <Link href="/debug" className="rounded-button px-2.5 py-1.5 hover:text-ink-on-shell">
                {t.nav.debug}
              </Link>
            </nav>
            <ConnectionPill />
            <button
              type="button"
              onClick={() => setPref('presenter', true)}
              aria-label={t.view.presenter}
              title={t.view.presenterHint}
              className="vw-press inline-flex size-10 items-center justify-center rounded-button border border-control-border text-ink-on-shell"
            >
              <Presentation aria-hidden className="size-4.5" />
            </button>
            <ViewMenu />
            <ThemeToggle />
            {token ? (
              <button
                type="button"
                onClick={() => setToken(null)}
                aria-label={t.operator.lock}
                className="vw-press inline-flex h-10 items-center gap-2 rounded-button border border-control-border px-3.5 text-body font-semibold text-ink-on-shell"
              >
                <LockOpen aria-hidden className="size-4" />
                {t.operator.unlocked}
              </button>
            ) : (
              <button type="button" onClick={openDialog} className="vw-press inline-flex h-10 items-center gap-2 rounded-button bg-accent px-4 text-body font-semibold text-on-accent">
                <Lock aria-hidden className="size-4" />
                {t.operator.locked}
              </button>
            )}
          </>
        )}
        {presenter && <ThemeToggle />}
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
