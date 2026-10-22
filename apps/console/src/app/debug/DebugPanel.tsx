'use client';

import { planHash, planTrip, parityHash, SCORING_RULES } from '@vighnaway/engine';
import {
  CircleCheck,
  CircleHelp,
  Cpu,
  Hash,
  Layers,
  Network,
  Timer,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { cn } from '@/lib/cn';
import { graphFor, GRAPH_FILE, placeById, SCENARIO } from '@/lib/scenario';
import { Reveal } from '@/components/motion/Reveal';
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
      setResult({
        ...parity,
        parityMs: t1 - t0,
        planMs: p1 - p0,
        planWarmMs: p2 - p1,
        demoPlanHash: planHash(plan),
      });
    }, 50);
    api
      .health()
      .then((h) => setServerGraph(h.graphVersion))
      .catch(() => setServerGraph(null));
    return () => clearTimeout(timer);
  }, []);

  const graphMatch = serverGraph === null ? null : serverGraph === GRAPH_FILE.graphVersion;
  const tiles: [string, string | null, LucideIcon, string, string][] = [
    [
      t.debug.caseCount,
      result ? String(result.caseCount) : null,
      Layers,
      'bg-brand-from/12 text-brand-from',
      'var(--vw-brand-from)',
    ],
    [
      t.debug.parityTime,
      result ? t.debug.ms(result.parityMs) : null,
      Timer,
      'bg-accent/12 text-accent',
      'var(--vw-accent)',
    ],
    [
      t.debug.planTime,
      result ? t.debug.ms(result.planMs) : null,
      Cpu,
      'bg-warn/12 text-warn',
      'var(--vw-warn)',
    ],
    [
      t.debug.planTimeWarm,
      result ? t.debug.ms(result.planWarmMs) : null,
      Zap,
      'bg-brand-via/12 text-brand-via',
      'var(--vw-brand-via)',
    ],
  ];
  const graphRows: [string, string][] = [
    [t.debug.graphVersion, GRAPH_FILE.graphVersion],
    [t.debug.graphSource, GRAPH_FILE.source],
    [t.debug.scenarioGraphVersion, SCENARIO.graphVersion],
    [t.debug.serverGraphVersion, serverGraph ?? t.debug.unknown],
  ];
  const engineRows: [string, string][] = [
    [t.debug.rulesVersion, String(SCORING_RULES.version)],
    [t.debug.planHash, result?.demoPlanHash ?? t.debug.computing],
    [t.debug.apiUrl, API_URL],
  ];
  const status =
    graphMatch === null
      ? {
          Icon: CircleHelp,
          label: t.debug.graphUnknown,
          box: 'bg-panel-sunken text-ink-on-shell-muted',
          tone: 'var(--vw-ink-on-shell-muted)',
        }
      : graphMatch
        ? {
            Icon: CircleCheck,
            label: t.debug.graphMatch,
            box: 'bg-positive/12 text-positive',
            tone: 'var(--vw-positive)',
          }
        : {
            Icon: TriangleAlert,
            label: t.debug.graphMismatch,
            box: 'bg-danger/12 text-danger',
            tone: 'var(--vw-danger)',
          };

  return (
    <div className="mt-10 flex flex-col gap-6" data-testid="debug-table">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Reveal>
          <section className="vw-hero flex h-full flex-col justify-between gap-6 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="eyebrow flex items-center gap-2 text-chrome-accent">
                <Hash aria-hidden className="size-4" />
                {t.debug.parityHash}
              </h2>
              {result && (
                <span className="tech rounded-chip border border-chrome-line bg-chrome-fill px-2.5 py-1">
                  {t.debug.caseCount}: {result.caseCount}
                </span>
              )}
            </div>
            {result ? (
              <p
                className="font-mono text-clock font-semibold tracking-tight break-all"
                data-key={t.debug.parityHash}
              >
                {result.hash}
              </p>
            ) : (
              <div className="flex flex-col gap-2" role="status">
                <Skeleton className="h-10 w-3/4" />
                <span className="text-meta text-chrome-ink-muted">{t.debug.computing}</span>
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section
            className="vw-tone-card flex h-full flex-col gap-4 p-6"
            style={toneStyle(status.tone)}
          >
            <h2 className="eyebrow text-ink-on-shell-muted">{t.debug.serverGraphVersion}</h2>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn('grid size-11 shrink-0 place-items-center rounded-card', status.box)}
              >
                <status.Icon className="size-6" />
              </span>
              <p className="text-title font-semibold">{status.label}</p>
            </div>
            <dl className="well mt-auto grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3">
              <dt className="text-meta text-ink-on-shell-muted">{t.debug.graphVersion}</dt>
              <dd className="tech truncate">{GRAPH_FILE.graphVersion}</dd>
              <dt className="text-meta text-ink-on-shell-muted">{t.debug.serverGraphVersion}</dt>
              <dd className="tech truncate">{serverGraph ?? t.debug.unknown}</dd>
            </dl>
          </section>
        </Reveal>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, Icon, box, tone], i) => (
          <Reveal key={label} delay={i * 0.06}>
            <div className="vw-tone-card flex h-full items-start gap-4 p-5" style={toneStyle(tone)}>
              <span
                aria-hidden
                className={cn('grid size-10 shrink-0 place-items-center rounded-card', box)}
              >
                <Icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-meta font-medium text-ink-on-shell-muted">{label}</dt>
                <dd
                  className="font-mono text-console-title font-semibold tabular text-ink-on-shell"
                  data-key={label}
                >
                  {value ?? <Skeleton className="mt-1 h-6 w-20" />}
                </dd>
              </div>
            </div>
          </Reveal>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
          <DetailCard
            title={t.debug.graphGroup}
            Icon={Network}
            box="bg-accent/12 text-accent"
            tone="var(--vw-accent)"
            rows={graphRows}
            graphMatch={graphMatch}
          />
        </Reveal>
        <Reveal delay={0.08}>
          <DetailCard
            title={t.debug.engineGroup}
            Icon={Cpu}
            box="bg-brand-from/12 text-brand-from"
            tone="var(--vw-brand-from)"
            rows={engineRows}
            graphMatch={graphMatch}
          />
        </Reveal>
      </div>
    </div>
  );
}

/** Sets the card hue for `.vw-tone-card` from a --vw-* colour. */
const toneStyle = (tone: string) => ({ '--tone': tone }) as CSSProperties;

function DetailCard({
  title,
  Icon,
  box,
  tone,
  rows,
  graphMatch,
}: {
  title: string;
  Icon: LucideIcon;
  box: string;
  tone: string;
  rows: [string, string][];
  graphMatch: boolean | null;
}) {
  return (
    <section className="vw-tone-card h-full" style={toneStyle(tone)}>
      <h2 className="flex items-center gap-3 border-b border-shell-hairline px-6 py-4 text-title font-semibold">
        <span aria-hidden className={cn('grid size-8 place-items-center rounded-button', box)}>
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)]">
        {rows.map(([k, v], i) => (
          <div key={k} className={cn('contents', i % 2 === 1 && '[&>*]:bg-panel-sunken/60')}>
            <dt className="eyebrow flex items-center px-6 py-3.5 text-ink-on-shell-muted">{k}</dt>
            <dd
              className="flex items-center gap-2 px-6 py-3.5 font-mono text-body break-all text-ink-on-shell"
              data-key={k}
            >
              {v}
              {k === t.debug.serverGraphVersion && graphMatch !== null && (
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-chip',
                    graphMatch ? 'bg-positive' : 'bg-danger',
                  )}
                  aria-hidden
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
