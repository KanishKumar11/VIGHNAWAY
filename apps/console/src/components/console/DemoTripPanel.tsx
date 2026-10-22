'use client';

import type { Incident, PlanResult, RouteEvaluation } from '@vighnaway/contracts';
import { formatDistance, formatSimClock } from '@vighnaway/contracts';
import { nextActionText, renderText } from '@vighnaway/engine';
import { motion as motionTokens } from '@vighnaway/tokens';
import { ArrowRight, Clock, Cpu, Gauge, Hospital, Info, Navigation, OctagonX, Phone, Ruler, Scale, ShieldCheck, TriangleAlert, Undo2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentLang, t } from '@/i18n';
import { bannerBody, routeLabel, rt } from '@/i18n/engineText';
import { cn } from '@/lib/cn';
import { currentEtaS, recommendedRoute, type TripChange, type TripState } from '@/lib/demoTrip';
import { placeById } from '@/lib/scenario';
import { activeScenario, useActiveScenario } from '@/stores/scenario';
import { incidentList } from '@/lib/sync';
import { useLiveStore } from '@/stores/live';
import { type RouteMotion } from '@/hooks/useRouteChangeMotion';
import { tripEnv } from '@/hooks/useDemoTrip';
import { ReceiptCard } from '@/components/console/ReceiptCard';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import { EvidenceChips } from '@/components/shared/EvidenceChips';
import { IncidentGlyph } from '@/components/shared/IncidentGlyph';
import { RouteStrip, routeStripText } from '@/components/shared/RouteStrip';
import { RollingText } from '@/components/motion/RollingText';
import { Skeleton } from '@/components/ui/skeleton';

const ease = motionTokens.easeOut as [number, number, number, number];
const springSnappy = { type: 'spring' as const, ...motionTokens.springSnappy };
const clock = (s: number) => formatSimClock(activeScenario().clockStartsAt, s);

export { bannerBody };

/** "What to do now": one plain sentence, rendered from the engine's structured text in the active language. */
export function whatToDoNow(plan: PlanResult, destName: string | undefined): string {
  return renderText(nextActionText(plan, destName), currentLang());
}

/** Hero ETA on the navy hero card: large Inter numerals (tabular) that roll on change; units quieter. */
function EtaHero({ seconds }: { seconds: number | null }) {
  if (seconds === null) return <p className="text-display font-bold text-chrome-ink">–</p>;
  const parts = t.time.duration(seconds).split(/(\d+)/).filter(Boolean);
  return (
    <p className="flex items-baseline text-chrome-ink tabular">
      <span className="sr-only">{t.time.duration(seconds)}</span>
      <span aria-hidden className="flex items-baseline">
        {parts.map((p, i) =>
          /^\d+$/.test(p) ? (
            <RollingText key={`n${parts.length - i}`} text={p} className="text-[calc(var(--vw-text-display)*1.2)] leading-none font-bold tracking-tight" />
          ) : (
            <span key={`u${parts.length - i}`} className="ml-1.5 mr-2.5 text-title font-semibold text-chrome-ink-muted">
              {p.trim()}
            </span>
          ),
        )}
      </span>
    </p>
  );
}

/** A short sample of the route's line, so each row carries the same structure as the map. */
export function LineSwatch({ role, className }: { role: RouteEvaluation['role'] | 'old'; className?: string }) {
  if (role === 'blocked' || role === 'old')
    return <span aria-hidden className={cn('block w-6 shrink-0 border-t-4 border-dashed', role === 'old' ? 'border-route-muted' : 'border-danger', className)} />;
  return (
    <span
      aria-hidden
      className={cn(
        'block w-6 shrink-0 rounded-chip',
        role === 'recommended' ? 'h-1.5 bg-route-recommended' : role === 'usual_fastest' ? 'h-1 bg-route-muted' : 'h-0.75 bg-route-muted',
        className,
      )}
    />
  );
}

/** Hazards that shaped this decision: those on the recommended route, and what caused the change. */
function relevantIncidents(route: RouteEvaluation, change: TripChange | null, incidents: readonly Incident[]): Incident[] {
  const ids = new Set(route.hazards.filter((h) => h.effect !== 'none').map((h) => h.incidentId));
  if (change?.triggerIncidentId) ids.add(change.triggerIncidentId);
  const order = [...(change?.triggerIncidentId ? [change.triggerIncidentId] : []), ...ids];
  const out: Incident[] = [];
  for (const id of new Set(order)) {
    const inc = incidents.find((i) => i.id === id);
    if (inc) out.push(inc);
  }
  return out.slice(0, 3);
}

function Evidence({ items, nowS }: { items: Incident[]; nowS: number }) {
  if (!items.length) return null;
  return (
    <ul className="mt-5 flex flex-col gap-3.5 border-t border-shell-line pt-4" aria-label={t.list.incidents}>
      {items.map((inc) => (
        <li key={inc.id} className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-button',
              inc.status === 'verified' ? 'bg-danger text-white' : inc.status === 'resolved' || inc.status === 'dismissed' ? 'bg-panel-sunken text-resolved' : 'bg-warn-surface text-warn-ink',
            )}
          >
            <IncidentGlyph type={inc.type} className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink-on-shell">
              {t.evidence.hazard(inc)}
              {inc.roadName && <span className="font-normal text-ink-on-shell-muted"> · {inc.roadName}</span>}
            </p>
            <div className="mt-1.5">
              <EvidenceChips incident={inc} nowS={nowS} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Route-change sequence step 6: what the decision was, what it is now, and why. */
function WhatChanged({ change, plan, incidents, nowS }: { change: TripChange; plan: PlanResult; incidents: readonly Incident[]; nowS: number }) {
  const fromName = change.fromRouteName;
  const fromNow = fromName ? plan.routes.find((r) => r.name === fromName) : undefined;
  const to = plan.routes.find((r) => r.routeId === change.toRouteId);
  const cause = incidents.find((i) => i.id === change.triggerIncidentId);
  const from = fromName && fromName !== to?.name ? { name: fromName, viable: fromNow ? fromNow.viable : true } : null;
  if (!from && !to) return null;
  return (
    <motion.section
      aria-labelledby="changed-title"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease }}
      className="mt-5 border-t border-shell-line pt-4"
    >
      <h4 id="changed-title" className="flex items-baseline justify-between gap-3">
        <span className="text-meta font-semibold text-warn-ink">{t.decision.whatChanged}</span>
        <span className="tech text-ink-on-shell-muted">{clock(change.atS)}</span>
      </h4>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-body">
        {from && (
          <>
            <dt className="text-meta text-ink-on-shell-muted">{t.decision.was}</dt>
            <dd className="flex min-w-0 items-center gap-2.5 text-ink-on-shell-muted">
              <LineSwatch role="old" />
              <span className="truncate line-through decoration-1">{from.name}</span>
              {!from.viable && <span className="shrink-0 text-meta font-semibold text-danger-ink">{t.route.notViable}</span>}
            </dd>
            <dd className="text-right text-ink-on-shell-muted tabular">{change.fromEtaS !== null ? t.time.duration(change.fromEtaS) : '–'}</dd>
          </>
        )}
        {to && (
          <>
            <dt className="text-meta text-ink-on-shell-muted">{t.decision.nowLabel}</dt>
            <dd className="flex min-w-0 items-center gap-2.5 font-semibold text-ink-on-shell">
              <LineSwatch role="recommended" />
              <span className="truncate">{to.name}</span>
            </dd>
            <dd className="text-right font-semibold text-ink-on-shell tabular">{change.toEtaS !== null ? t.time.duration(change.toEtaS) : '–'}</dd>
          </>
        )}
        {cause && (
          <>
            <dt className="self-start pt-0.5 text-meta text-ink-on-shell-muted">{t.decision.cause}</dt>
            <dd className="col-span-2 text-ink-on-shell">
              {t.evidence.hazard(cause)}
              {cause.roadName && <span className="text-ink-on-shell-muted"> · {cause.roadName}</span>}
              <span className="mt-1.5 block">
                <EvidenceChips incident={cause} nowS={nowS} />
              </span>
            </dd>
          </>
        )}
      </dl>
    </motion.section>
  );
}

/** The route decision (DESIGN_VISION section 8): lead with the ETA, then the route, why, and evidence. */
function Decision({ route, trip, motion: m, incidents, nowS, destName }: { route: RouteEvaluation; trip: TripState; motion: RouteMotion; incidents: readonly Incident[]; nowS: number; destName?: string }) {
  const sync = useLiveStore((s) => s.sync);
  const etaS = useMemo(() => currentEtaS(tripEnv(), trip, incidents.length ? incidents : incidentList(sync)), [trip, sync, incidents]);
  const change = trip.change;
  const pending = change !== null && m.change?.id !== change.id;
  const flashing = change !== null && (pending || m.phase === 'flash');
  // Until the engine's result is shown on the map, the decision still shows what was followed.
  const prev = useRef<{ route: RouteEvaluation; eta: number | null; plan: PlanResult }>({ route, eta: etaS, plan: trip.plan });
  if (!flashing) prev.current = { route, eta: etaS, plan: trip.plan };
  const shown = flashing ? prev.current.route : route;
  const shownEta = flashing ? (change?.fromEtaS ?? prev.current.eta) : etaS;
  const enRoute = trip.mode !== 'origin' && !trip.arrived;
  const reversal = trip.plan.notices.find((n) => n.kind === 'reversal');
  const showChange = !!change && !flashing;
  // The change's cause is shown with its evidence under "What changed"; list the rest here.
  const evidence = relevantIncidents(shown, null, incidents).filter((i) => !showChange || i.id !== change?.triggerIncidentId);
  const doNow = whatToDoNow(flashing ? prev.current.plan : trip.plan, destName);

  return (
    <article aria-label={`${t.decision.label}: ${routeLabel(shown)}`} className="px-5 pt-5 pb-6">
      {reversal && (
        <p role="alert" className="mb-4 flex items-center gap-2.5 rounded-button border border-danger bg-danger-surface px-3.5 py-2.5 text-body font-semibold text-danger-ink">
          <Undo2 aria-hidden className="size-5 shrink-0" />
          {t.decision.reversal}
        </p>
      )}
      <div className="vw-hero px-5 pt-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-meta font-semibold text-chrome-accent">
            <span aria-hidden className="block h-1.5 w-5 rounded-chip bg-chrome-accent" />
            {t.decision.label}
          </p>
          {change && !flashing && <span className="rounded-chip bg-warn-surface px-2.5 py-0.5 text-meta font-semibold text-warn-ink">{t.route.changedAt(clock(change.atS))}</span>}
        </div>

        <div className="mt-4 flex items-end justify-between gap-5">
          <div>
            <EtaHero seconds={shownEta} />
            <p className="mt-1.5 text-meta text-chrome-ink-muted">{enRoute ? t.trip.remaining : t.decision.estimated}</p>
          </div>
          <dl className="flex shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2.5 rounded-button border border-chrome-line bg-chrome-fill px-3 py-1.5">
              <Clock aria-hidden className="size-4 shrink-0 text-chrome-accent" />
              <div className="flex flex-col leading-tight">
                <dt className="text-eyebrow font-medium text-chrome-ink-muted">{t.trip.arrive}</dt>
                <dd className="text-body font-semibold text-chrome-ink tabular">{shownEta === null ? '–' : clock(trip.simTimeS + shownEta)}</dd>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-button border border-chrome-line bg-chrome-fill px-3 py-1.5">
              <Ruler aria-hidden className="size-4 shrink-0 text-chrome-accent" />
              <div className="flex flex-col leading-tight">
                <dt className="text-eyebrow font-medium text-chrome-ink-muted">{t.route.distance}</dt>
                <dd className="text-body font-semibold text-chrome-ink tabular">{formatDistance(shown.distanceM)}</dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.h3
          key={shown.routeId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease }}
          className="mt-5 text-console-title font-semibold tracking-tight text-ink-on-shell"
        >
          {routeLabel(shown)}
        </motion.h3>
      </AnimatePresence>
      <p className="mt-1.5 flex items-start gap-2 text-body font-medium text-ink-on-shell">
        <ArrowRight aria-hidden className="mt-0.5 size-4.5 shrink-0 text-accent-ink" />
        <span>
          <span className="sr-only">{t.decision.now}: </span>
          {doNow}
        </span>
      </p>

      <dl className="mt-4 divide-y divide-shell-line overflow-hidden rounded-card border border-shell-line bg-shell-raised text-body shadow-sm">
        <div className="flex gap-3 px-4 py-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-button bg-teal-soft text-accent-ink">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <dt className="text-meta font-semibold text-accent-ink">{t.route.avoids}</dt>
            <dd className="mt-0.5 text-ink-on-shell">{rt(shown.explanation.reasonText, shown.explanation.reason)}</dd>
          </div>
        </div>
        <div className="flex gap-3 px-4 py-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-button bg-warn-soft text-warn-ink">
            <Scale className="size-4" />
          </span>
          <div className="min-w-0">
            <dt className="text-meta font-semibold text-warn-ink">{t.route.tradeOff}</dt>
            <dd className="mt-0.5 text-ink-on-shell">{shown.explanation.tradeOff ? rt(shown.explanation.tradeOffText, shown.explanation.tradeOff) : t.route.noTradeOff}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-3 rounded-card border border-shell-line bg-shell-raised px-4 pt-4 pb-3.5 shadow-sm">
        <RouteStrip route={shown} />
        <span className="sr-only">{routeStripText(shown)}</span>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-shell-line pt-3">
          <Gauge aria-hidden className="size-4 shrink-0 text-ink-on-shell-muted" />
          <ConfidenceMeter confidence={shown.explanation.confidence} />
          {shown.explanation.confidenceReasons.length > 0 && <p className="text-meta text-ink-on-shell-muted">{shown.explanation.confidenceReasons.map((reason, i) => rt(shown.explanation.confidenceReasonTexts?.[i], reason)).join(' · ')}</p>}
        </div>
        <p className="mt-2.5 rounded-button bg-panel-sunken px-3 py-2 text-meta text-ink-on-shell-muted">
          <span className="font-semibold text-ink-on-shell">{t.route.recheckIf}:</span> {rt(shown.explanation.recheckIfText, shown.explanation.recheckIf)}
        </p>
      </div>

      {change && !flashing && <WhatChanged change={change} plan={trip.plan} incidents={incidents} nowS={nowS} />}
      <Evidence items={evidence} nowS={nowS} />
    </article>
  );
}

function NoViable({ trip, destName }: { trip: TripState; destName?: string }) {
  return (
    <motion.article
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: motionTokens.noViableRoute / 1000, ease }}
      className="px-5 pt-5 pb-6"
    >
      <p className="flex items-center gap-2.5 text-meta font-semibold text-danger-ink">
        <OctagonX aria-hidden className="size-4.5" />
        {t.route.notViable}
      </p>
      <h3 className="mt-2 text-console-title font-semibold text-ink-on-shell">{t.route.noViable.title}</h3>
      <p className="mt-1.5 text-body text-ink-on-shell">{t.route.noViable.body}</p>
      <p className="mt-3 flex items-start gap-2 text-body font-medium text-ink-on-shell">
        <ArrowRight aria-hidden className="mt-0.5 size-4.5 shrink-0 text-danger" />
        {whatToDoNow(trip.plan, destName)}
      </p>
      {trip.plan.reachable && (
        <p className="mt-4 flex items-center gap-2.5 border-t border-shell-line pt-4 text-body font-semibold text-ink-on-shell">
          <Hospital aria-hidden className="size-4.5 shrink-0" />
          {t.route.noViable.nearest(trip.plan.reachable.placeName, t.time.duration(trip.plan.reachable.etaS))}
        </p>
      )}
      <p className="mt-4 flex items-center gap-2 rounded-button border border-danger bg-danger-surface px-3.5 py-2.5 text-title font-semibold text-danger-ink">
        <Phone aria-hidden className="size-5" />
        {t.route.noViable.footer}
      </p>
    </motion.article>
  );
}

/** Other routes as aligned rows: line sample, name and role, ETA, difference. */
function Comparison({ rec, others }: { rec: RouteEvaluation | null; others: RouteEvaluation[] }) {
  if (!others.length) return rec ? <p className="border-t border-shell-line px-5 py-4 text-meta text-ink-on-shell-muted">{t.route.onlyRoute}</p> : null;
  return (
    <section aria-labelledby="compare-title" className="border-t border-shell-line px-5 pt-4 pb-5">
      <h3 id="compare-title" className="text-meta font-semibold text-ink-on-shell-muted">
        {t.route.compare}
      </h3>
      <ul className="mt-2.5 flex flex-col gap-2">
        {others.map((r) => {
          const blocked = r.role === 'blocked' || !r.viable;
          return (
            <li key={r.routeId} aria-label={`${t.route.roles[r.role]}: ${routeLabel(r)}`} className={cn('rounded-card border px-4 py-3 shadow-sm transition-[border-color,box-shadow] hover:shadow-md', blocked ? 'border-danger/25 bg-danger-surface' : 'border-shell-line bg-shell-raised hover:border-shell-hairline-strong')}>
              <div className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3">
                <LineSwatch role={r.role} />
                <p className="min-w-0 truncate text-body font-semibold text-ink-on-shell">{routeLabel(r)}</p>
                <p className={cn('text-right text-body font-semibold tabular', blocked ? 'text-danger-ink' : 'text-ink-on-shell')}>{blocked ? t.route.notViable : t.time.duration(r.etaS)}</p>
                <span />
                {blocked ? (
                  <p className="text-meta text-danger-ink">{rt(r.explanation.reasonText, r.explanation.reason)}</p>
                ) : (
                  <p>
                    <span className="inline-flex h-5 items-center rounded-chip bg-panel-sunken px-2 text-eyebrow font-semibold text-ink-on-shell-muted">{t.route.roles[r.role]}</span>
                  </p>
                )}
                <p className={cn('text-right text-meta font-semibold tabular', !rec || blocked ? 'text-ink-on-shell-muted' : r.etaS < rec.etaS ? 'text-positive-ink' : 'text-warn-ink')}>
                  {!blocked && rec ? t.route.deltaVsRecommended(t.time.delta(r.etaS - rec.etaS)) : ''}
                </p>
                {r.counterfactualText && (
                  <p className="col-span-3 mt-2.5 rounded-button bg-panel-sunken px-3 py-2 text-meta text-ink-on-shell-muted" data-testid="why-not">
                    <span className="font-semibold text-ink-on-shell">{t.route.whyNot}</span> {rt(r.counterfactualText, '')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function vehicleLine(trip: TripState): string {
  if (trip.arrived) return t.trip.arrived(placeById(trip.destinationId, activeScenario())?.name ?? trip.destinationId);
  if (trip.mode === 'phone') return trip.phone?.status === 'stopped' ? t.trip.stopped : t.trip.vehiclePhone;
  if (trip.mode === 'local') return t.trip.vehicleLocal;
  return t.trip.vehicleNone;
}

/** The banner shows once the map has the engine's new route (after the emphasis step). */
export const changeBannerVisible = (trip: TripState | null, m: RouteMotion, dismissedId: number | null): boolean => {
  const change = trip?.change ?? null;
  return !!change && dismissedId !== change.id && m.change?.id === change.id && (m.phase === 'transition' || m.phase === 'settled');
};

/** Route-change notice over the map: the warning or critical treatment, no glow. */
export function ChangeBanner({ trip, motion: m, dismissedId, onDismiss }: { trip: TripState | null; motion: RouteMotion; dismissedId: number | null; onDismiss: (id: number) => void }) {
  const change = trip?.change ?? null;
  const visible = changeBannerVisible(trip, m, dismissedId);
  const danger = change?.kind === 'no_viable_route' || change?.kind === 'destination';
  return (
    <AnimatePresence initial={false}>
      {visible && change && (
        <motion.div
          key={change.id}
          role="status"
          aria-live="assertive"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSnappy}
          className={cn(
            'pointer-events-auto flex w-full max-w-160 items-start gap-3.5 rounded-card border py-3.5 pr-3 pl-4 shadow-md',
            danger ? 'border-danger bg-danger-surface' : 'border-warn bg-warn-surface',
          )}
        >
          <TriangleAlert aria-hidden className={cn('mt-0.5 size-5 shrink-0', danger ? 'text-danger' : 'text-warn')} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-3">
              <span className={cn('text-title font-semibold', danger ? 'text-danger-ink' : 'text-warn-ink')}>{danger ? t.route.noViable.title : t.route.changedTitle}</span>
              <span className={cn('tech', danger ? 'text-danger-ink' : 'text-warn-ink')}>{clock(change.atS)}</span>
            </p>
            <p className={cn('mt-0.5 text-body', danger ? 'text-danger-ink' : 'text-warn-ink')}>{bannerBody(rt(change.messageText, change.message))}</p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(change.id)}
            aria-label={t.toast.dismiss}
            className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-button', danger ? 'text-danger-ink' : 'text-warn-ink')}
          >
            <X aria-hidden className="size-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** True for at least evaluatingMin after the incident set changes (not on the first plan). */
function useRecheck(key: string | null): boolean {
  const [on, setOn] = useState(false);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    if (last.current === null || last.current === key) {
      last.current = key;
      return;
    }
    last.current = key;
    setOn(true);
    const timer = setTimeout(() => setOn(false), motionTokens.evaluatingMin);
    return () => clearTimeout(timer);
  }, [key]);
  return on;
}

/** Static placeholder shaped like the decision; the words say what is happening. */
function DecisionSkeleton({ label }: { label: string }) {
  return (
    <div className="px-5 pt-5 pb-6" role="status" aria-label={label}>
      <p className="text-meta font-semibold text-ink-on-shell-muted">{label}</p>
      <Skeleton className="mt-4 h-12 w-2/5" />
      <Skeleton className="mt-5 h-6 w-3/5" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
      </div>
      <Skeleton className="mt-6 h-2 w-full rounded-chip" />
    </div>
  );
}

export function DemoTripPanel({
  trip,
  motion: m,
  incidents: given,
  nowS: givenNow,
}: {
  trip: TripState | null;
  motion: RouteMotion;
  incidents?: readonly Incident[];
  nowS?: number;
}) {
  const loading = useLiveStore((s) => s.sync.runId === null && s.apiReachable !== false);
  const sync = useLiveStore((s) => s.sync);
  const liveNow = useLiveStore((s) => s.simTimeS);
  const incidents = useMemo(() => given ?? incidentList(sync), [given, sync]);
  const nowS = givenNow ?? liveNow;
  const [evaluating, setEvaluating] = useState(true);
  useEffect(() => {
    if (loading || !trip) return;
    const timer = setTimeout(() => setEvaluating(false), motionTokens.evaluatingMin);
    return () => clearTimeout(timer);
  }, [loading, trip === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const rechecking = useRecheck(loading || !trip ? null : trip.incidentsKey);

  const scenario = useActiveScenario();
  const origin = placeById(scenario.demoTrip.originId, scenario);
  const dest = placeById(trip?.destinationId ?? scenario.demoTrip.destinationId, scenario);
  const rec = trip ? recommendedRoute(trip.plan) : null;
  const liveOthers = trip ? trip.plan.routes.filter((r) => r.routeId !== rec?.routeId) : [];
  // Until the map shows the engine's new result, the comparison still shows what it was.
  const flashing = !!trip?.change && (m.change?.id !== trip.change.id || m.phase === 'flash');
  const prevCompare = useRef<{ rec: RouteEvaluation | null; others: RouteEvaluation[] }>({ rec, others: liveOthers });
  if (!flashing) prevCompare.current = { rec, others: liveOthers };
  const compare = flashing ? prevCompare.current : { rec, others: liveOthers };
  const checkingLabel = trip ? t.trip.checking(trip.plan.routes.length, trip.plan.incidentCount) : t.trip.loading;

  return (
    <section aria-labelledby="trip-title" className="flex h-full min-h-0 flex-col">
      <header className="vw-panel-head border-b border-shell-line px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="trip-title" className="flex items-center gap-3 text-title font-semibold text-ink-on-shell">
            <span aria-hidden className="vw-brand-fill flex size-8 items-center justify-center rounded-button shadow-sm">
              <Navigation className="size-4" />
            </span>
            {t.trip.title}
          </h2>
          {trip && rechecking && (
            <span className="inline-flex h-7 items-center rounded-chip border border-shell-line bg-panel-sunken px-2.5 text-meta font-medium text-ink-on-shell-muted" role="status">
              {checkingLabel}
            </span>
          )}
        </div>
        <div className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-3.5 rounded-card border border-accent/20 bg-recommended-surface px-4 py-3">
          <span aria-hidden className="flex flex-col items-center py-1.5">
            <span className="size-3 rounded-chip border-[3px] border-route-recommended bg-shell-raised ring-3 ring-route-recommended/15" />
            <span className="my-1 w-0.5 flex-1 rounded-chip bg-route-recommended/40" />
            <Hospital className="size-4 text-accent-ink" />
          </span>
          <div className="flex flex-col gap-2.5">
            <p className="text-body text-ink-on-shell-muted">{origin?.name}</p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={dest?.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-title font-semibold text-ink-on-shell">
                {dest?.name}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <span className="sr-only">{t.trip.fromTo(origin?.name ?? '', dest?.name ?? '')}</span>
        {trip && (
          <p className="mt-2.5 flex items-center gap-1.5 text-meta text-ink-on-shell-muted">
            <Info aria-hidden className="size-3.5 shrink-0" />
            {vehicleLine(trip)}
          </p>
        )}
      </header>

      <div className="vw-scroll flex min-h-0 flex-1 flex-col overflow-y-auto *:shrink-0">
        {loading || !trip ? (
          <DecisionSkeleton label={t.trip.loading} />
        ) : evaluating ? (
          <DecisionSkeleton label={checkingLabel} />
        ) : (
          <>
            {trip.notice && !trip.change && (
              <p className="flex items-start gap-2.5 border-b border-shell-line bg-panel-sunken px-5 py-3 text-meta text-ink-on-shell">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-on-shell-muted" />
                {rt(trip.notice.messageText, trip.notice.message)}
              </p>
            )}
            {trip.plan.noViableRoute && !rec && <NoViable trip={trip} destName={dest?.name} />}
            {rec && <Decision route={rec} trip={trip} motion={m} incidents={incidents} nowS={nowS} destName={dest?.name} />}
            <Comparison rec={compare.rec} others={compare.others} />
            {rec && !given && <ReceiptCard destinationId={trip.destinationId} />}
          </>
        )}
      </div>
      <p className="flex items-center gap-2 border-t border-shell-line bg-panel-sunken px-5 py-3 text-meta text-ink-on-shell-muted">
        <Cpu aria-hidden className="size-3.5 shrink-0" />
        {t.trip.engineNote}
      </p>
    </section>
  );
}
