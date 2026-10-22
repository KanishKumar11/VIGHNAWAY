'use client';

import { planHash, planTrip, parityHash, SCORING_RULES } from '@vighnaway/engine';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { cn } from '@/lib/cn';
import { graphFor, GRAPH_FILE, placeById, SCENARIO } from '@/lib/scenario';
import { Skeleton } from '@/components/ui/skeleton';

interface Result {
  hash: string;
  caseCount: number;
  parityMs: number;
  planMs: number;
  planWarmMs: number;
  demoPlanHash: string;
}

/** Runs the engine's parity fixture set in this browser and shows the hash. */
export function DebugPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [serverGraph, setServerGraph] = useState<string | null>(null);

  useEffect(() => {
    // Let the page paint first; the run is synchronous.
    const timer = setTimeout(() => {
      const graph = graphFor(SCENARIO.demoTrip.profile);
      const input = {
        graph,
        origin: placeById(SCENARIO.demoTrip.originId)!.nodeId,
        destination: placeById(SCENARIO.demoTrip.destinationId)!.nodeId,
        incidents: [],
        nowS: 1,
        alerts: SCENARIO.alerts,
        hasAlertInformation: SCENARIO.hasAlertInformation,
        places: SCENARIO.places,
        destinationPlaceId: SCENARIO.demoTrip.destinationId,
      };
      const p0 = performance.now();
      const plan = planTrip(input);
      const p1 = performance.now();
      planTrip(input);
      const p2 = performance.now();
      const t0 = performance.now();
      const parity = parityHash(GRAPH_FILE, SCENARIO);
      const t1 = performance.now();
      setResult({ ...parity, parityMs: t1 - t0, planMs: p1 - p0, planWarmMs: p2 - p1, demoPlanHash: planHash(plan) });
    }, 50);
    api
      .health()
      .then((h) => setServerGraph(h.graphVersion))
      .catch(() => setServerGraph(null));
    return () => clearTimeout(timer);
  }, []);

  const rows: [string, string][] = [
    [t.debug.caseCount, result ? String(result.caseCount) : t.debug.computing],
    [t.debug.graphVersion, GRAPH_FILE.graphVersion],
    [t.debug.graphSource, GRAPH_FILE.source],
    [t.debug.scenarioGraphVersion, SCENARIO.graphVersion],
    [t.debug.serverGraphVersion, serverGraph ?? t.debug.unknown],
    [t.debug.rulesVersion, String(SCORING_RULES.version)],
    [t.debug.parityTime, result ? t.debug.ms(result.parityMs) : t.debug.computing],
    [t.debug.planTime, result ? t.debug.ms(result.planMs) : t.debug.computing],
    [t.debug.planTimeWarm, result ? t.debug.ms(result.planWarmMs) : t.debug.computing],
    [t.debug.planHash, result?.demoPlanHash ?? t.debug.computing],
    [t.debug.apiUrl, API_URL],
  ];
  const graphMatch = serverGraph === null ? null : serverGraph === GRAPH_FILE.graphVersion;
  return (
    <div className="mt-10 flex flex-col gap-4" data-testid="debug-table">
      <section className="relative overflow-hidden rounded-sheet border border-panel-hairline bg-panel-raised text-ink shadow-lg">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent" />
        <div className="flex items-center justify-between border-b border-panel-hairline px-6 py-3">
          <h2 className="eyebrow text-ink-muted">{t.debug.parityHash}</h2>
          {result && <span className="eyebrow text-ink-muted">{t.debug.caseCount}: {result.caseCount}</span>}
        </div>
        <div className="px-6 py-7">
          {result ? (
            <p className="font-mono text-console-title font-semibold break-all" data-key={t.debug.parityHash}>
              {result.hash}
            </p>
          ) : (
            <div className="flex flex-col gap-2" role="status">
              <Skeleton onPanel className="h-7 w-3/4" />
              <span className="text-meta text-ink-muted">{t.debug.computing}</span>
            </div>
          )}
        </div>
      </section>
      <dl className="surface grid grid-cols-[max-content_1fr] overflow-hidden rounded-sheet">
        {rows.map(([k, v], i) => (
          <div key={k} className={cn('contents', i % 2 === 1 && '[&>*]:bg-shell-overlay/40')}>
            <dt className="eyebrow flex items-center px-6 py-3.5 text-ink-on-shell-muted">{k}</dt>
            <dd className="flex items-center gap-2 px-6 py-3.5 font-mono text-body break-all text-ink-on-shell" data-key={k}>
              {v}
              {k === t.debug.serverGraphVersion && graphMatch !== null && (
                <span className={cn('size-2 shrink-0 rounded-chip', graphMatch ? 'bg-positive' : 'bg-danger')} aria-hidden />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
