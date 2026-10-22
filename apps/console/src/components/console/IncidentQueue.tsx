'use client';

import type { Incident, OperatorAction } from '@vighnaway/contracts';
import { formatSimClock } from '@vighnaway/contracts';
import { alertContext } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import { Ban, CircleCheck, CloudRain, Link2, Radio, ShieldCheck } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { recommendedRoute, type TripState } from '@/lib/demoTrip';
import { groupIncidents, incidentFacts, isClosed, QUEUE_GROUPS, type QueueGroup } from '@/lib/incidents';
import { GRAPH_FILE, isLiveScenario } from '@/lib/scenario';
import { displayIncidents, useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { activeScenario, useActiveScenario } from '@/stores/scenario';
import { useIncidentAction } from '@/hooks/useOperatorActions';
import { usePulse } from '@/hooks/usePulse';
import { EvidenceChips, RingIcon } from '@/components/shared/EvidenceChips';
import { IncidentGlyph } from '@/components/shared/IncidentGlyph';
import { Skeleton } from '@/components/ui/skeleton';

const GROUP_RING: Record<QueueGroup, Incident['status']> = { corroborated: 'corroborated', unverified: 'unverified', verified: 'verified', closed: 'resolved' };
const spring = { type: 'spring' as const, ...motionTokens.springSoft };
const secondaryBtn =
  'vw-press inline-flex h-9 items-center gap-1.5 rounded-button border border-control-border px-2.5 text-meta font-semibold text-ink-on-shell disabled:opacity-50';

function IncidentRow({
  incident,
  nowS,
  pending,
  selected,
  readOnly,
  onSelect,
  onAction,
}: {
  incident: Incident;
  nowS: number;
  pending: boolean;
  selected: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAction: (incident: Incident, action: OperatorAction) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const pulseKey = useLiveStore((s) => s.pulses[incident.id] ?? 0);
  usePulse(ref, pulseKey);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  const f = incidentFacts(incident, nowS);
  const closed = isClosed(incident);
  const s = incident.status;
  return (
    <motion.article
      ref={ref}
      layout="position"
      layoutId={incident.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ ...spring, opacity: { duration: 0.25 } }}
      aria-label={`${f.title}, ${f.status}, ${f.source}, ${f.age}`}
      className={cn('relative border-t border-shell-line px-5 py-4', selected && 'bg-panel-sunken', closed && 'opacity-75')}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />}
      <button type="button" className="flex w-full items-start gap-3 rounded-button text-left" onClick={() => onSelect(incident.id)} aria-pressed={selected}>
        <span
          className={cn(
            'relative flex size-10 shrink-0 items-center justify-center rounded-button',
            s === 'verified' ? 'bg-danger text-white' : closed ? 'bg-panel-sunken text-resolved' : 'bg-warn-surface text-warn-ink',
          )}
        >
          <IncidentGlyph type={incident.type} className="size-5.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('text-title font-semibold text-ink-on-shell', closed && 'line-through decoration-ink-on-shell-muted')}>{f.title}</span>
          <span className="truncate text-body text-ink-on-shell-muted">{incident.roadName ? t.queue.road(incident.roadName) : t.queue.unknownRoad}</span>
        </span>
      </button>
      <div className="mt-3 pl-13">
        <EvidenceChips incident={incident} nowS={nowS} />
        {incident.feed ? (
          <div className="mt-2.5 text-meta text-ink-on-shell-muted">
            {incident.feed.description && (
              <p className="flex items-center gap-1.5 text-body text-ink-on-shell">
                <Radio aria-hidden className="size-3.5 shrink-0 text-ink-on-shell-muted" />
                {incident.feed.description}
              </p>
            )}
            {incident.feed.from && incident.feed.to && <p>{t.queue.feedRoute(incident.feed.from, incident.feed.to)}</p>}
            {incident.feed.delayS !== null && incident.feed.delayS > 0 && <p>{t.queue.feedDelay(Math.round(incident.feed.delayS / 60))}</p>}
            <p>{t.queue.feedSeen(formatSimClock(activeScenario().clockStartsAt, incident.feed.lastSeenAtS), t.time.age(nowS - incident.feed.lastSeenAtS))}</p>
          </div>
        ) : (
          <p className="mt-2 text-meta text-ink-on-shell-muted">
            {t.queue.reports(incident.reportCount, incident.deviceCount)} · {t.queue.lastReport(f.lastReportClock, f.age)}
          </p>
        )}
        {incident.note && incident.note !== incident.feed?.description && (
          <p className="mt-2.5 border-l-2 border-shell-line pl-3 text-body text-ink-on-shell">
            <span className="mb-0.5 block text-meta font-semibold text-ink-on-shell-muted">{t.queue.note}</span>
            {/* Plain text only: React escapes it. */}
            {incident.note}
          </p>
        )}
        {incident.linkedIncidentId && (
          <p className="mt-2 flex items-center gap-1.5 text-meta text-ink-on-shell-muted">
            <Link2 aria-hidden className="size-3.5" />
            {t.queue.linked}
          </p>
        )}
        {!closed && !readOnly && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {s !== 'verified' && (
              <button
                type="button"
                className="vw-press inline-flex h-9 items-center gap-1.5 rounded-button bg-accent px-2.5 text-meta font-semibold text-on-accent disabled:opacity-50"
                disabled={pending}
                onClick={() => onAction(incident, 'verify')}
              >
                <ShieldCheck aria-hidden className="size-4" />
                {t.queue.verify}
              </button>
            )}
            <button type="button" className={secondaryBtn} disabled={pending} onClick={() => onAction(incident, 'resolve')}>
              <CircleCheck aria-hidden className="size-4" />
              {t.queue.resolve}
            </button>
            <button type="button" className={secondaryBtn} disabled={pending} onClick={() => onAction(incident, 'dismiss')}>
              <Ban aria-hidden className="size-4" />
              {t.queue.dismiss}
            </button>
            {pending && <span className="ml-auto text-meta text-ink-on-shell-muted">{t.queue.pending}</span>}
          </div>
        )}
      </div>
    </motion.article>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-1 flex-col" role="status" aria-label={t.queue.loading}>
      <p className="px-5 pb-3 text-meta text-ink-on-shell-muted">{t.queue.loading}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-t border-shell-line px-5 py-4" style={{ opacity: 1 - i * 0.25 }}>
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The start state: a quiet brief of the situation rather than an empty box. Scenario, rain alert,
 * the roads known to be at risk, and what to watch, from the scenario and the current plan.
 */
export function SituationBrief({ trip }: { trip: TripState | null }) {
  const scenario = useActiveScenario();
  const live = isLiveScenario(scenario);
  const nowS = useLiveStore((s) => s.simTimeS);
  const rain = alertContext(scenario.alerts, scenario.hasAlertInformation, nowS).rainAlertActive;
  const alert = scenario.alerts.find((a) => a.kind === 'rain');
  const atRisk = useMemo(() => {
    const names = new Map<string, string>();
    for (const e of GRAPH_FILE.edges) if (e.floodProne && e.name) names.set(e.name, e.tunnel ? t.route.strip.kinds.underpass : '');
    return [...names.entries()];
  }, []);
  const crossings = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of trip?.plan.routes ?? []) for (const c of r.crossings) if (!atRisk.some(([n]) => n === c.name)) out.set(c.name, t.route.strip.kinds[c.kind]);
    return [...out.entries()];
  }, [trip, atRisk]);
  const rec = trip ? recommendedRoute(trip.plan) : null;
  const watched = rec?.crossings.find((c) => atRisk.some(([n]) => n === c.name));
  return (
    <section aria-labelledby="situation-title" className="flex flex-1 flex-col px-5 pb-6">
      <h3 id="situation-title" className="text-title font-semibold text-ink-on-shell">
        {t.situation.title}
      </h3>
      <p className="mt-1 text-body text-ink-on-shell-muted">{live ? t.situation.live : t.app.scenarioShort(scenario.name)}</p>

      {alert && (
        <p className="mt-5 flex items-start gap-2.5 text-body text-ink-on-shell">
          <CloudRain aria-hidden className="mt-0.5 size-5 shrink-0 text-flood-prone-solid" />
          <span>
            {rain ? alert.label : `${alert.label} (${t.sim.alertInactive})`}
            <span className="block text-meta text-ink-on-shell-muted">{alert.source}</span>
          </span>
        </p>
      )}

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-body">
        <dt className="text-meta font-semibold text-ink-on-shell-muted">{t.situation.atRisk}</dt>
        <dd className="text-ink-on-shell">
          {atRisk.length ? atRisk.map(([name, kind]) => (
                <span key={name} className="block">
                  {name} {kind && <span className="text-ink-on-shell-muted">· {kind}</span>}
                </span>
              )) : t.situation.none}
        </dd>
        {crossings.length > 0 && (
          <>
            <dt className="text-meta font-semibold text-ink-on-shell-muted">{t.situation.crossings}</dt>
            <dd className="text-ink-on-shell">
              {crossings.map(([name, kind]) => (
                <span key={name} className="block">
                  {name} <span className="text-ink-on-shell-muted">· {kind}</span>
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <p className="mt-6 text-meta font-semibold text-ink-on-shell-muted">{t.situation.watch}</p>
      <p className="mt-1 text-body text-ink-on-shell">{watched && rec ? t.situation.watchLine(watched.name, rec.name) : t.situation.watchGeneric}</p>

      <div className="mt-auto border-t border-shell-line pt-4 text-body">
        <p className="text-ink-on-shell">{live ? t.queue.emptyLive : t.queue.empty}</p>
        <p className="mt-1 text-meta text-ink-on-shell-muted">{t.situation.noData}</p>
      </div>
    </section>
  );
}

export function IncidentQueue({
  selectedId,
  onSelect,
  incidents: given,
  nowS: givenNow,
  readOnly = false,
  trip = null,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown instead of the live set (decision replay). */
  incidents?: readonly Incident[];
  nowS?: number;
  /** Replay and presenter mode: no operator actions. */
  readOnly?: boolean;
  trip?: TripState | null;
}) {
  const sync = useLiveStore((s) => s.sync);
  const optimistic = useLiveStore((s) => s.optimistic);
  const confirmed = useLiveStore((s) => s.confirmed);
  const liveNow = useLiveStore((s) => s.simTimeS);
  const reachable = useLiveStore((s) => s.apiReachable);
  const token = useOperator((s) => s.token);
  const openDialog = useOperator((s) => s.openDialog);
  const action = useIncidentAction();
  const liveIncidents = useMemo(() => displayIncidents({ sync, optimistic, confirmed }), [sync, optimistic, confirmed]);
  const incidents = given ?? liveIncidents;
  const nowS = givenNow ?? liveNow;
  const groups = useMemo(() => groupIncidents(incidents), [incidents]);
  const loading = !given && sync.runId === null && reachable !== false && incidents.length === 0;
  const active = incidents.filter((i) => !isClosed(i)).length;

  const onAction = (incident: Incident, a: OperatorAction) => {
    if (readOnly) return;
    if (!token) {
      openDialog();
      return;
    }
    action.mutate({ incident, action: a });
  };

  return (
    <section aria-labelledby="queue-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
        <h2 id="queue-title" className="text-title font-semibold text-ink-on-shell">
          {t.queue.title}
        </h2>
        {!loading && <span className="text-meta font-medium text-ink-on-shell-muted tabular">{t.queue.active(active)}</span>}
      </header>

      {loading ? (
        <QueueSkeleton />
      ) : incidents.length === 0 ? (
        <div className="vw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          <SituationBrief trip={trip} />
        </div>
      ) : (
        <div className="vw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <LayoutGroup>
            {QUEUE_GROUPS.map((g) => {
              const list = groups[g];
              return (
                <motion.div key={g} layout="position" className="flex flex-col">
                  <h3 className={cn('flex items-center gap-2 px-5 pt-3 pb-2 text-ink-on-shell-muted', list.length === 0 && 'opacity-60')}>
                    <span className="sr-only">{t.queue.groupCount(t.queue.groups[g], list.length)}</span>
                    <RingIcon status={GROUP_RING[g]} className={cn(g === 'verified' ? 'text-danger' : g === 'closed' ? 'text-resolved' : 'text-warn')} />
                    <span aria-hidden className="text-meta font-semibold">
                      {t.queue.groups[g]}
                    </span>
                    <span aria-hidden className="text-meta font-medium tabular">
                      {list.length}
                    </span>
                  </h3>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {list.map((inc) => (
                      <IncidentRow
                        key={inc.id}
                        incident={inc}
                        nowS={nowS}
                        pending={!!optimistic[inc.id]}
                        selected={selectedId === inc.id}
                        readOnly={readOnly}
                        onSelect={onSelect}
                        onAction={onAction}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </LayoutGroup>
        </div>
      )}
      <p className="border-t border-shell-line px-5 py-3 text-meta text-ink-on-shell-muted">{t.queue.corroborationHeuristic}</p>
    </section>
  );
}
