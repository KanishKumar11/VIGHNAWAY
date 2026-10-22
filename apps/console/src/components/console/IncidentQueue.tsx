'use client';

import type { Incident, OperatorAction } from '@vighnaway/contracts';
import { formatSimClock } from '@vighnaway/contracts';
import { alertContext, coverageBriefText, evidenceCoverage, observationsFromIncidents } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import { Ban, CircleCheck, CloudRain, Link2, Radio, ShieldCheck } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { recommendedRoute, type TripState } from '@/lib/demoTrip';
import { groupIncidents, incidentFacts, isClosed, QUEUE_GROUPS, type QueueGroup } from '@/lib/incidents';
import { GRAPH_FILE, graphFor, isLiveScenario } from '@/lib/scenario';
import { incidentList } from '@/lib/sync';
import { rt } from '@/i18n/engineText';
import { CoverageChip } from '@/components/console/CoverageChip';
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
/** Summary tile per queue group: tinted when it has incidents, quiet when empty. */
const TILE_TONE = (filled: boolean): Record<QueueGroup, string> => {
  const quiet = 'border-shell-line bg-panel-sunken text-ink-on-shell-muted';
  return {
    corroborated: filled ? 'border-shell-line bg-warn-surface text-warn-ink' : quiet,
    unverified: filled ? 'border-shell-line bg-warn-surface text-warn-ink' : quiet,
    verified: filled ? 'border-shell-line bg-danger-surface text-danger-ink' : quiet,
    closed: quiet,
  };
};
const secondaryBtn = 'vw-press ctl h-9 px-3 text-meta disabled:opacity-50';

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
      className={cn(
        'relative mx-5 my-1.5 rounded-card border px-4 py-4 transition-colors',
        selected ? 'border-accent bg-recommended-surface shadow-sm' : 'border-shell-line bg-shell-raised hover:border-shell-hairline-strong',
        closed && 'opacity-75',
      )}
    >
      <button type="button" className="flex w-full items-start gap-3 rounded-button text-left" onClick={() => onSelect(incident.id)} aria-pressed={selected}>
        <span
          className={cn(
            'relative flex size-11 shrink-0 items-center justify-center rounded-card',
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
      <div className="mt-3.5 pl-14">
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
          <p className="well mt-3 px-3.5 py-2.5 text-body text-ink-on-shell">
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
      </div>
      {!closed && !readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-shell-line pt-3.5">
          {s !== 'verified' && (
            <button type="button" className="vw-press ctl-primary h-9 flex-auto px-3 text-meta whitespace-nowrap disabled:opacity-50" disabled={pending} onClick={() => onAction(incident, 'verify')}>
              <ShieldCheck aria-hidden className="size-4" />
              {t.queue.verify}
            </button>
          )}
          <button type="button" className={cn(secondaryBtn, 'flex-auto whitespace-nowrap')} disabled={pending} onClick={() => onAction(incident, 'resolve')}>
            <CircleCheck aria-hidden className="size-4" />
            {t.queue.resolve}
          </button>
          <button type="button" className={cn(secondaryBtn, 'flex-auto whitespace-nowrap')} disabled={pending} onClick={() => onAction(incident, 'dismiss')}>
            <Ban aria-hidden className="size-4" />
            {t.queue.dismiss}
          </button>
        </div>
      )}
      {pending && <p className="mt-2 text-right text-meta text-ink-on-shell-muted">{t.queue.pending}</p>}
    </motion.article>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-1 flex-col" role="status" aria-label={t.queue.loading}>
      <p className="px-5 pb-3 text-meta text-ink-on-shell-muted">{t.queue.loading}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mx-5 my-1.5 rounded-card border border-shell-line px-4 py-4" style={{ opacity: 1 - i * 0.25 }}>
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
  const sync = useLiveStore((st) => st.sync);
  const coverage = useMemo(
    () => evidenceCoverage(graphFor(scenario.demoTrip.profile), observationsFromIncidents(incidentList(sync)), nowS),
    [scenario, sync, nowS],
  );
  const coverageByName = useMemo(() => new Map(coverage.map((c) => [c.name, c] as const)), [coverage]);
  const crossings = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of trip?.plan.routes ?? []) for (const c of r.crossings) if (!atRisk.some(([n]) => n === c.name)) out.set(c.name, t.route.strip.kinds[c.kind]);
    return [...out.entries()];
  }, [trip, atRisk]);
  const rec = trip ? recommendedRoute(trip.plan) : null;
  const watched = rec?.crossings.find((c) => atRisk.some(([n]) => n === c.name));
  return (
    <section aria-labelledby="situation-title" className="flex flex-1 flex-col gap-5 px-5 py-5">
      <div>
        <h3 id="situation-title" className="text-title font-semibold text-ink-on-shell">
          {t.situation.title}
        </h3>
        <p className="mt-0.5 text-body text-ink-on-shell-muted">{live ? t.situation.live : t.app.scenarioShort(scenario.name)}</p>
      </div>

      {alert && (
        <p className="well flex items-start gap-3 p-3.5 text-body text-ink-on-shell">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-button bg-shell-raised shadow-sm">
            <CloudRain aria-hidden className="size-5 text-flood-prone-solid" />
          </span>
          <span className="min-w-0">
            <span className="font-medium">{rain ? alert.label : `${alert.label} (${t.sim.alertInactive})`}</span>
            <span className="block text-meta text-ink-on-shell-muted">{alert.source}</span>
          </span>
        </p>
      )}

      <div>
        <p className="text-meta font-semibold text-ink-on-shell-muted">{t.situation.atRisk}</p>
        <p className="mt-1 text-body font-medium text-ink-on-shell" data-testid="coverage-brief">
          {rt(coverageBriefText(coverage, nowS), '')}
        </p>
        <p className="text-meta text-ink-on-shell-muted">{t.coverage.note}</p>
        {atRisk.length ? (
          <ul className="mt-1.5 divide-y divide-shell-line">
            {atRisk.map(([name, kind]) => (
              <li key={name} className="flex items-baseline justify-between gap-3 py-2 text-body text-ink-on-shell">
                <span className="min-w-0">{name}</span>
                {kind && <span className="shrink-0 text-meta text-ink-on-shell-muted">{kind}</span>}
                {coverageByName.get(name) && <CoverageChip road={coverageByName.get(name)!} nowS={nowS} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-body text-ink-on-shell">{t.situation.none}</p>
        )}
      </div>

      {crossings.length > 0 && (
        <div>
          <p className="text-meta font-semibold text-ink-on-shell-muted">{t.situation.crossings}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {crossings.map(([name, kind]) => (
              <li key={name} className="rounded-chip border border-shell-line bg-panel-sunken px-2.5 py-1 text-meta text-ink-on-shell">
                {name} <span className="text-ink-on-shell-muted">· {kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-shell-line border-l-4 border-l-accent bg-recommended-surface px-4 py-3">
        <p className="text-meta font-semibold text-recommended-ink">{t.situation.watch}</p>
        <p className="mt-1 text-body text-ink-on-shell">{watched && rec ? t.situation.watchLine(watched.name, rec.name) : t.situation.watchGeneric}</p>
      </div>

      <div className="mt-auto rounded-card border border-dashed border-shell-hairline-strong px-4 py-3 text-body">
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
      <header className="flex items-center justify-between gap-3 border-b border-shell-line px-5 py-4">
        <h2 id="queue-title" className="flex items-center gap-2.5 text-title font-semibold text-ink-on-shell">
          <span aria-hidden className="vw-title-bar" />
          {t.queue.title}
        </h2>
        {!loading && (
          <span className={cn('inline-flex h-7 items-center rounded-chip px-3 text-meta font-semibold tabular', active > 0 ? 'bg-warn-surface text-warn-ink' : 'bg-panel-sunken text-ink-on-shell-muted')}>
            {t.queue.active(active)}
          </span>
        )}
      </header>

      {!loading && (
        <ul aria-hidden className="grid grid-cols-2 gap-2 border-b border-shell-line px-5 py-4">
          {QUEUE_GROUPS.map((g) => (
            <li key={g} className={cn('flex items-center gap-2.5 rounded-card border px-3 py-2.5', TILE_TONE(groups[g].length > 0)[g])}>
              <RingIcon status={GROUP_RING[g]} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-meta font-semibold">{t.queue.groups[g]}</span>
              <span className="text-title font-bold tabular">{groups[g].length}</span>
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <QueueSkeleton />
      ) : incidents.length === 0 ? (
        <div className="vw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          <SituationBrief trip={trip} />
        </div>
      ) : (
        <div className="vw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
          <LayoutGroup>
            {QUEUE_GROUPS.map((g) => {
              const list = groups[g];
              return (
                <motion.div key={g} layout="position" className="flex flex-col">
                  {/* Empty groups stay in the accessibility tree (the summary tiles show them) but take no space. */}
                  <h3 className={cn(list.length === 0 ? 'sr-only' : 'flex items-center gap-2 px-5 pt-4 pb-1.5 text-ink-on-shell-muted')}>
                    <span className="sr-only">{t.queue.groupCount(t.queue.groups[g], list.length)}</span>
                    {list.length > 0 && (
                      <>
                        <RingIcon status={GROUP_RING[g]} className={cn(g === 'verified' ? 'text-danger' : g === 'closed' ? 'text-resolved' : 'text-warn')} />
                        <span aria-hidden className="text-meta font-semibold">
                          {t.queue.groups[g]}
                        </span>
                      </>
                    )}
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
      <p className="border-t border-shell-line bg-panel-sunken px-5 py-3 text-meta text-ink-on-shell-muted">{t.queue.corroborationHeuristic}</p>
    </section>
  );
}
