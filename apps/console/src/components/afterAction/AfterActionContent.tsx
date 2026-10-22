'use client';

import type { HistoryResponse } from '@vighnaway/contracts';
import { formatDuration } from '@vighnaway/contracts';
import { Printer, TriangleAlert, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageShell } from '@/components/shared/PageShell';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n';
import { rt, routeLabel } from '@/i18n/engineText';
import { api } from '@/lib/api';
import { buildAfterAction, type AfterAction, type RouteFigure } from '@/lib/afterAction';
import { cn } from '@/lib/cn';
import { tripEnv } from '@/hooks/useDemoTrip';
import { useScenarioStore } from '@/stores/scenario';

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'done'; report: AfterAction; placeNames: Record<string, string> };

/** /after-action: the run's decisions, rebuilt in this browser from the recorded history (P2-1). */
export function AfterActionContent() {
  const id = useScenarioStore((s) => s.id);
  const [state, setState] = useState<State>({ phase: 'loading' });
  useEffect(() => useScenarioStore.getState().hydrate(), []);

  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    const env = tripEnv(id);
    api
      .history(id)
      .then((history: HistoryResponse) => {
        if (!live) return;
        const placeNames = Object.fromEntries(env.scenario.places.map((p) => [p.id, p.name]));
        setState({ phase: 'done', report: buildAfterAction(env, history), placeNames });
      })
      .catch((err: unknown) => live && setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <PageShell title={t.afterAction.title} eyebrow={t.afterAction.eyebrow} active="/after-action" intro={<p>{t.afterAction.intro}</p>}>
      <div className="mt-6 flex justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className="flex h-11 items-center gap-2 rounded-button border border-control-border bg-panel-raised px-4 text-body font-semibold text-ink">
          <Printer aria-hidden className="size-4.5" />
          {t.afterAction.print}
        </button>
      </div>
      <div className="mt-4" aria-live="polite">
        {state.phase === 'loading' && (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-body text-ink-on-shell-muted">{t.afterAction.loading}</p>
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {state.phase === 'error' && (
          <p role="alert" className="flex items-start gap-3 rounded-card border border-warn bg-warn-surface px-5 py-4 text-body text-warn-ink">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            {t.afterAction.fetchFailed(state.message)}
          </p>
        )}
        {state.phase === 'done' && <AfterActionView report={state.report} placeNames={state.placeNames} />}
      </div>
    </PageShell>
  );
}

function Route({ label, fig }: { label: string; fig: RouteFigure | null }) {
  return (
    <div className="min-w-0">
      <p className="text-meta font-semibold text-ink-on-shell-muted">{label}</p>
      {fig ? (
        <>
          <p className="text-body font-semibold text-ink-on-shell">
            {routeLabel(fig)} · {formatDuration(fig.etaS)}
          </p>
          <p className="text-meta text-ink-on-shell-muted">
            {fig.blocks > 0 ? t.map.legend.blocked : t.route.confidenceLabel(t.route.confidence[fig.confidence])} · {t.afterAction.hazards(fig.hazards)}
            {fig.blocks > 0 ? ` · ${t.afterAction.blocks(fig.blocks)}` : ''}
          </p>
        </>
      ) : (
        <p className="text-body text-ink-on-shell-muted">{t.afterAction.noRoute}</p>
      )}
    </div>
  );
}

/** The report itself: pure rendering of a built AfterAction. */
export function AfterActionView({ report, placeNames }: { report: AfterAction; placeNames: Record<string, string> }) {
  const s = report.summary;
  const tiles: Array<[string, number]> = [
    [t.afterAction.tiles.incidents, s.incidents],
    [t.afterAction.tiles.reports, s.reports],
    [t.afterAction.tiles.operator, s.operatorActions],
    [t.afterAction.tiles.changes, s.routeChanges],
    [t.afterAction.tiles.switches, s.destinationSwitches],
  ];
  const meta: Array<[string, string]> = [
    [t.afterAction.meta.scenario, report.simulated ? `${report.scenarioName} · ${t.afterAction.meta.simulated}` : report.scenarioName],
    [t.afterAction.meta.run, report.runId],
    [t.afterAction.meta.graph, report.graphVersion],
    [t.afterAction.meta.rules, report.rulesHash.slice(0, 12)],
    [t.afterAction.meta.engine, report.engineVersion],
  ];
  if (!report.moments.length) return <p className="text-body text-ink-on-shell-muted">{t.afterAction.empty}</p>;
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="aa-prov">
        <h2 id="aa-prov" className="text-console-title font-semibold">
          {t.afterAction.provenance}
        </h2>
        <dl className="mt-3 grid gap-x-10 gap-y-1 sm:grid-cols-2">
          {meta.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-shell-line py-2">
              <dt className="text-meta font-semibold text-ink-on-shell-muted">{k}</dt>
              <dd className="tech text-body break-all text-ink-on-shell">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="aa-sum">
        <h2 id="aa-sum" className="text-console-title font-semibold">
          {t.afterAction.summaryTitle}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map(([label, n]) => (
            <li key={label} className="rounded-card border border-shell-line bg-panel-raised px-4 py-3 text-ink">
              <p className="text-title font-semibold">{n}</p>
              <p className="text-meta text-ink-muted">{label}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="aa-cmp" className="flex flex-col gap-2">
        <h2 id="aa-cmp" className="text-console-title font-semibold">
          {t.afterAction.comparisonTitle}
        </h2>
        <p className="text-body text-ink-on-shell">{s.noViableRouteAtEnd ? t.afterAction.noViable : s.extraMin > 0 ? t.afterAction.slower(String(s.extraMin)) : t.afterAction.notSlower}</p>
        {s.usualBlockedAtEnd && <p className="text-body text-ink-on-shell">{t.afterAction.usualBlocked}</p>}
        <p className="text-body text-ink-on-shell-muted">{t.afterAction.hazardsLine(s.recommendedHazardsAtEnd, s.usualHazardsAtEnd)}</p>
        {s.startDestinationId !== s.endDestinationId && (
          <p className="text-body text-ink-on-shell-muted">{t.afterAction.destinationLine(placeNames[s.startDestinationId] ?? s.startDestinationId, placeNames[s.endDestinationId] ?? s.endDestinationId)}</p>
        )}
      </section>

      <section aria-labelledby="aa-time">
        <h2 id="aa-time" className="text-console-title font-semibold">
          {t.afterAction.timelineTitle}
        </h2>
        <p className="mt-1 text-meta text-ink-on-shell-muted">{t.afterAction.etaNote}</p>
        <ol className="mt-3 flex flex-col gap-4">
          {report.moments.map((m) => (
            <li key={m.seq} className="rounded-card border border-shell-line bg-panel-raised p-4 text-ink break-inside-avoid">
              <div className="flex flex-wrap items-center gap-3">
                <span className="tech text-body font-semibold">{m.clock}</span>
                <span className="text-meta text-ink-muted">#{m.seq}</span>
                {m.operator && (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-accent-surface px-2.5 text-meta font-semibold text-accent-ink">
                    <UserCheck aria-hidden className="size-3.5" />
                    {t.afterAction.operatorBadge}
                  </span>
                )}
                {m.change && <span className="inline-flex h-7 items-center rounded-chip bg-warn-surface px-2.5 text-meta font-semibold text-warn-ink">{t.afterAction.changed}</span>}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {m.entries.map((e) => (
                  <li key={e.seq} className="text-body">
                    {e.summary}
                  </li>
                ))}
              </ul>
              {m.change && <p className="mt-2 text-body font-semibold">{rt(m.change.messageText, m.change.message)}</p>}
              <div className={cn('mt-3 grid gap-4 sm:grid-cols-2')}>
                <Route label={t.afterAction.recommended} fig={m.recommended} />
                <Route label={t.afterAction.usual} fig={m.usualFastest} />
              </div>
              <p className="mt-3 text-meta print:hidden">
                <Link href={`/verify?r=${m.receipt}`} className="font-semibold text-accent underline">
                  {t.afterAction.verifyLink}
                </Link>
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="aa-lim">
        <h2 id="aa-lim" className="text-console-title font-semibold">
          {t.afterAction.limits}
        </h2>
        <p className="mt-2 text-body text-ink-on-shell-muted">{t.afterAction.limitsBody}</p>
      </section>
    </div>
  );
}
