'use client';

import type { Incident, OperatorAction } from '@vighnaway/contracts';
import { formatSimClock } from '@vighnaway/contracts';
import {
  alertContext,
  coverageBriefText,
  evidenceCoverage,
  observationsFromIncidents,
} from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import {
  Ban,
  CircleCheck,
  CloudRain,
  Eye,
  History,
  Inbox,
  Link2,
  ListChecks,
  Quote,
  Radio,
  Route,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Users,
  Waypoints,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { recommendedRoute, type TripState } from '@/lib/demoTrip';
import {
  groupIncidents,
  incidentFacts,
  isClosed,
  QUEUE_GROUPS,
  type QueueGroup,
} from '@/lib/incidents';
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

const GROUP_RING: Record<QueueGroup, Incident['status']> = {
  corroborated: 'corroborated',
  unverified: 'unverified',
  verified: 'verified',
  closed: 'resolved',
};
const spring = { type: 'spring' as const, ...motionTokens.springSoft };
/** Soft, distinct tint per summary tile, so the four counts read apart at a glance. */
const SUMMARY_TONE: Record<QueueGroup, { tile: string; chip: string; ink: string }> = {
  corroborated: {
    tile: 'border-brand-from/20 bg-brand-from/8',
    chip: 'bg-brand-from/15 text-brand-from',
    ink: 'text-brand-from',
  },
  unverified: {
    tile: 'border-warn/25 bg-warn/8',
    chip: 'bg-warn/15 text-warn-ink',
    ink: 'text-warn-ink',
  },
  verified: {
    tile: 'border-danger/20 bg-danger/8',
    chip: 'bg-danger/15 text-danger-ink',
    ink: 'text-danger-ink',
  },
  closed: {
    tile: 'border-positive/25 bg-positive/8',
    chip: 'bg-positive/15 text-positive-ink',
    ink: 'text-positive-ink',
  },
};
/** Status tone per queue group: the icon chip, the count and the card's tinted surface share it. */
const GROUP_TONE: Record<
  QueueGroup,
  { chip: string; count: string; card: string; tile: string; bar: string }
> = {
  // Corroborated shares the warn hue in tokens; the brand tint (as on its summary tile) sets it apart from Unverified.
  corroborated: {
    chip: 'bg-brand-from text-white',
    count: 'text-brand-from',
    card: 'border-brand-from/30 bg-brand-from/8 hover:border-brand-from/55',
    tile: 'bg-brand-from/8',
    bar: 'bg-brand-from',
  },
  unverified: {
    chip: 'bg-warn text-on-accent',
    count: 'text-warn-ink',
    card: 'border-warn/35 bg-warn-surface hover:border-warn/60',
    tile: 'bg-warn-surface',
    bar: 'bg-warn',
  },
  verified: {
    chip: 'bg-danger text-white',
    count: 'text-danger-ink',
    card: 'border-danger/30 bg-danger-surface hover:border-danger/55',
    tile: 'bg-danger-surface',
    bar: 'bg-danger',
  },
  closed: {
    chip: 'bg-positive/15 text-positive-ink',
    count: 'text-positive-ink',
    card: 'border-positive/25 bg-positive-soft hover:border-positive/50',
    tile: 'bg-positive-soft',
    bar: 'bg-resolved',
  },
};
const groupOf = (incident: Incident): QueueGroup =>
  isClosed(incident)
    ? 'closed'
    : incident.status === 'verified'
      ? 'verified'
      : incident.status === 'corroborated'
        ? 'corroborated'
        : 'unverified';
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
        'relative mx-4 my-1.5 overflow-hidden rounded-card border p-4 shadow-sm transition-[border-color,box-shadow] hover:shadow-md',
        GROUP_TONE[groupOf(incident)].card,
        selected && 'border-accent shadow-glow-teal hover:border-accent',
        closed && 'opacity-75',
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-button text-left"
        onClick={() => onSelect(incident.id)}
        aria-pressed={selected}
      >
        <span
          className={cn(
            'relative flex size-10 shrink-0 items-center justify-center rounded-button',
            GROUP_TONE[groupOf(incident)].chip,
          )}
        >
          <IncidentGlyph type={incident.type} className="size-5.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'text-body font-semibold text-ink-on-shell',
              closed && 'line-through decoration-ink-on-shell-muted',
            )}
          >
            {f.title}
          </span>
          <span className="truncate text-meta text-ink-on-shell-muted">
            {incident.roadName ? t.queue.road(incident.roadName) : t.queue.unknownRoad}
          </span>
        </span>
      </button>
      <div className="mt-3.5 flex flex-col gap-2.5">
        <EvidenceChips incident={incident} nowS={nowS} />
        <div className="divide-y divide-shell-hairline overflow-hidden rounded-card border border-shell-hairline bg-shell-raised/60 text-meta">
          {incident.feed ? (
            <>
              {incident.feed.description && (
                <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell">
                  <Radio aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-on-shell-muted" />
                  <span className="font-medium">{incident.feed.description}</span>
                </div>
              )}
              {incident.feed.from && incident.feed.to && (
                <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell-muted">
                  <Route aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t.queue.feedRoute(incident.feed.from, incident.feed.to)}</span>
                </div>
              )}
              {incident.feed.delayS !== null && incident.feed.delayS > 0 && (
                <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell-muted">
                  <Timer aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t.queue.feedDelay(Math.round(incident.feed.delayS / 60))}</span>
                </div>
              )}
              <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell-muted">
                <History aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span className="tabular">
                  {t.queue.feedSeen(
                    formatSimClock(activeScenario().clockStartsAt, incident.feed.lastSeenAtS),
                    t.time.age(nowS - incident.feed.lastSeenAtS),
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell-muted">
                <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span className="tabular">
                  {t.queue.reports(incident.reportCount, incident.deviceCount)}
                </span>
              </div>
              <div className="flex items-start gap-2.5 px-3 py-2 text-ink-on-shell-muted">
                <History aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span className="tabular">{t.queue.lastReport(f.lastReportClock, f.age)}</span>
              </div>
            </>
          )}
        </div>
        {incident.note && incident.note !== incident.feed?.description && (
          <figure className="flex gap-2.5 rounded-card border border-shell-hairline bg-shell-raised/60 px-3 py-2.5">
            <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-on-shell-muted" />
            <div className="min-w-0">
              <figcaption className="text-eyebrow font-semibold text-ink-on-shell-muted">
                {t.queue.note}
              </figcaption>
              {/* Plain text only: React escapes it. */}
              <blockquote className="mt-0.5 text-body text-ink-on-shell">
                {incident.note}
              </blockquote>
            </div>
          </figure>
        )}
        {incident.linkedIncidentId && (
          <p className="flex items-center gap-1.5 text-meta text-ink-on-shell-muted">
            <Link2 aria-hidden className="size-3.5" />
            {t.queue.linked}
          </p>
        )}
      </div>
      {!closed && !readOnly && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {s !== 'verified' && (
            <button
              type="button"
              className="vw-press ctl-primary h-9 flex-auto px-3 text-meta whitespace-nowrap disabled:opacity-50"
              disabled={pending}
              onClick={() => onAction(incident, 'verify')}
            >
              <ShieldCheck aria-hidden className="size-4" />
              {t.queue.verify}
            </button>
          )}
          <button
            type="button"
            className={cn(secondaryBtn, 'flex-auto whitespace-nowrap')}
            disabled={pending}
            onClick={() => onAction(incident, 'resolve')}
          >
            <CircleCheck aria-hidden className="size-4" />
            {t.queue.resolve}
          </button>
          <button
            type="button"
            className={cn(secondaryBtn, 'flex-auto whitespace-nowrap')}
            disabled={pending}
            onClick={() => onAction(incident, 'dismiss')}
          >
            <Ban aria-hidden className="size-4" />
            {t.queue.dismiss}
          </button>
        </div>
      )}
      {pending && (
        <p className="mt-2 text-right text-meta text-ink-on-shell-muted">{t.queue.pending}</p>
      )}
    </motion.article>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-1 flex-col" role="status" aria-label={t.queue.loading}>
      <p className="px-5 pb-3 text-meta text-ink-on-shell-muted">{t.queue.loading}</p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mx-5 my-1.5 rounded-card border border-shell-line px-4 py-4"
          style={{ opacity: 1 - i * 0.25 }}
        >
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
    for (const e of GRAPH_FILE.edges)
      if (e.floodProne && e.name) names.set(e.name, e.tunnel ? t.route.strip.kinds.underpass : '');
    return [...names.entries()];
  }, []);
  const sync = useLiveStore((st) => st.sync);
  const serverObservations = useLiveStore((st) => st.observations);
  const coverage = useMemo(
    // Incident reports plus the server's observations: a Road clear report makes no incident but is still a report.
    () =>
      evidenceCoverage(
        graphFor(scenario.demoTrip.profile),
        [...observationsFromIncidents(incidentList(sync)), ...serverObservations],
        nowS,
      ),
    [scenario, sync, serverObservations, nowS],
  );
  const coverageByName = useMemo(
    () => new Map(coverage.map((c) => [c.name, c] as const)),
    [coverage],
  );
  const crossings = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of trip?.plan.routes ?? [])
      for (const c of r.crossings)
        if (!atRisk.some(([n]) => n === c.name)) out.set(c.name, t.route.strip.kinds[c.kind]);
    return [...out.entries()];
  }, [trip, atRisk]);
  const rec = trip ? recommendedRoute(trip.plan) : null;
  const watched = rec?.crossings.find((c) => atRisk.some(([n]) => n === c.name));
  return (
    <section aria-labelledby="situation-title" className="flex flex-1 flex-col gap-3 px-4 py-4">
      <div className="px-1">
        <h3 id="situation-title" className="text-body font-semibold text-ink-on-shell">
          {t.situation.title}
        </h3>
        <p className="text-meta text-ink-on-shell-muted">
          {live ? t.situation.live : t.app.scenarioShort(scenario.name)}
        </p>
      </div>

      {alert && (
        <p
          className={cn(
            'flex items-start gap-3 rounded-card border p-3.5 text-body text-ink-on-shell shadow-sm',
            rain
              ? 'border-flood-prone-solid/30 bg-flood-prone'
              : 'border-shell-line bg-shell-raised',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-button bg-shell-raised shadow-sm">
            <CloudRain aria-hidden className="size-5 text-flood-prone-solid" />
          </span>
          <span className="min-w-0">
            <span className="font-medium">
              {rain ? alert.label : `${alert.label} (${t.sim.alertInactive})`}
            </span>
            <span className="block text-meta text-ink-on-shell-muted">{alert.source}</span>
          </span>
        </p>
      )}

      <div className="rounded-card border border-shell-line bg-shell-raised p-3.5 shadow-sm">
        <p className="flex items-center gap-2 text-meta font-semibold text-warn-ink">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t.situation.atRisk}
        </p>
        <p className="mt-1.5 text-body font-medium text-ink-on-shell" data-testid="coverage-brief">
          {rt(coverageBriefText(coverage, nowS), '')}
        </p>
        <p className="text-meta text-ink-on-shell-muted">{t.coverage.note}</p>
        {atRisk.length ? (
          <ul className="mt-2 divide-y divide-shell-line border-t border-shell-line">
            {atRisk.map(([name, kind]) => (
              <li
                key={name}
                className="flex items-baseline justify-between gap-3 py-2 text-body text-ink-on-shell"
              >
                <span className="min-w-0">{name}</span>
                {kind && <span className="shrink-0 text-meta text-ink-on-shell-muted">{kind}</span>}
                {coverageByName.get(name) && (
                  <CoverageChip road={coverageByName.get(name)!} nowS={nowS} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-body text-ink-on-shell">{t.situation.none}</p>
        )}
      </div>

      {crossings.length > 0 && (
        <div className="rounded-card border border-shell-line bg-shell-raised p-3.5 shadow-sm">
          <p className="flex items-center gap-2 text-meta font-semibold text-ink-on-shell-muted">
            <Waypoints aria-hidden className="size-3.5" />
            {t.situation.crossings}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {crossings.map(([name, kind]) => (
              <li
                key={name}
                className="rounded-chip border border-shell-line bg-panel-sunken px-2.5 py-1 text-meta text-ink-on-shell"
              >
                {name} <span className="text-ink-on-shell-muted">· {kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-accent/25 bg-recommended-surface p-3.5 shadow-sm">
        <p className="flex items-center gap-2 text-meta font-semibold text-recommended-ink">
          <Eye aria-hidden className="size-3.5" />
          {t.situation.watch}
        </p>
        <p className="mt-1 text-body text-ink-on-shell">
          {watched && rec
            ? t.situation.watchLine(watched.name, rec.name)
            : t.situation.watchGeneric}
        </p>
      </div>

      <div className="mt-auto flex flex-col items-center rounded-card border border-dashed border-shell-hairline-strong px-4 py-4 text-center text-body">
        <span
          aria-hidden
          className="mb-2 flex size-9 items-center justify-center rounded-chip bg-panel-sunken text-ink-on-shell-muted"
        >
          <Inbox className="size-4.5" />
        </span>
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
  const liveIncidents = useMemo(
    () => displayIncidents({ sync, optimistic, confirmed }),
    [sync, optimistic, confirmed],
  );
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
      <header className="vw-panel-head flex items-center justify-between gap-3 border-b border-shell-line px-5 py-4">
        <h2
          id="queue-title"
          className="flex items-center gap-3 text-title font-semibold text-ink-on-shell"
        >
          <span
            aria-hidden
            className="vw-brand-fill flex size-8 items-center justify-center rounded-button shadow-sm"
          >
            <ListChecks className="size-4.5" />
          </span>
          {t.queue.title}
        </h2>
        {!loading && (
          <span
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-meta font-semibold tabular',
              active > 0
                ? 'border-warn/30 bg-warn-surface text-warn-ink'
                : 'border-shell-line bg-panel-sunken text-ink-on-shell-muted',
            )}
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full', active > 0 ? 'bg-warn' : 'bg-resolved')}
            />
            {t.queue.active(active)}
          </span>
        )}
      </header>

      {!loading && (
        <ul aria-hidden className="mx-4 mt-4 mb-1 grid grid-cols-4 gap-2">
          {QUEUE_GROUPS.map((g) => {
            const n = groups[g].length;
            const tone = SUMMARY_TONE[g];
            return (
              <li
                key={g}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1.5 rounded-card border px-1 pt-2.5 pb-2 transition-colors',
                  tone.tile,
                  n > 0 && 'shadow-sm',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-chip',
                      tone.chip,
                    )}
                  >
                    <RingIcon status={GROUP_RING[g]} className="size-3" />
                  </span>
                  <span
                    className={cn(
                      'text-title leading-none font-bold tabular',
                      n > 0 ? tone.ink : 'text-ink-on-shell-muted',
                    )}
                  >
                    {n}
                  </span>
                </span>
                <span className={cn('max-w-full truncate text-eyebrow font-semibold', tone.ink)}>
                  {t.queue.groups[g]}
                </span>
              </li>
            );
          })}
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
                  <h3
                    className={cn(
                      list.length === 0
                        ? 'sr-only'
                        : 'flex items-center gap-2 px-5 pt-4 pb-1.5 text-ink-on-shell-muted',
                    )}
                  >
                    <span className="sr-only">
                      {t.queue.groupCount(t.queue.groups[g], list.length)}
                    </span>
                    {list.length > 0 && (
                      <>
                        <RingIcon
                          status={GROUP_RING[g]}
                          className={SUMMARY_TONE[g].ink}
                        />
                        <span aria-hidden className="text-meta font-semibold text-ink-on-shell">
                          {t.queue.groups[g]}
                        </span>
                        <span
                          aria-hidden
                          className="rounded-chip bg-panel-sunken px-1.5 text-eyebrow font-semibold tabular"
                        >
                          {list.length}
                        </span>
                        <span aria-hidden className="h-px flex-1 bg-shell-line" />
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
      <p className="border-t border-shell-line bg-panel-sunken px-5 py-3 text-meta text-ink-on-shell-muted">
        {t.queue.corroborationHeuristic}
      </p>
    </section>
  );
}
