'use client';

import type { CoverageClass, RoadCoverage } from '@vighnaway/engine';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * How recent the latest report on a road is, as a pattern plus colour plus words, so it reads
 * without colour: solid (fresh), long dashes (ageing), short dashes (stale), dots (no reports).
 * Uses the existing accent, warn and danger tokens only.
 */
const STYLE: Record<CoverageClass, { dash: string | undefined; cap: 'butt' | 'round'; tone: string }> = {
  fresh: { dash: undefined, cap: 'butt', tone: 'text-accent-ink' },
  ageing: { dash: '9 4', cap: 'butt', tone: 'text-warn-ink' },
  stale: { dash: '3 3', cap: 'butt', tone: 'text-danger-ink' },
  none: { dash: '0.1 5', cap: 'round', tone: 'text-ink-on-shell-muted' },
};

export function CoverageSwatch({ cls, className }: { cls: CoverageClass; className?: string }) {
  const s = STYLE[cls];
  return (
    <svg aria-hidden viewBox="0 0 28 6" className={cn('h-1.5 w-7 shrink-0', s.tone, className)}>
      <line x1="1" y1="3" x2="27" y2="3" stroke="currentColor" strokeWidth="3" strokeDasharray={s.dash} strokeLinecap={s.cap} />
    </svg>
  );
}

/** "Fresh", "Ageing · 1 h", "Stale · 4 h", "No reports". */
export function coverageLabel(road: Pick<RoadCoverage, 'class' | 'lastObservedAtS'>, nowS: number): string {
  const name = t.coverage.classes[road.class];
  return road.lastObservedAtS !== null && (road.class === 'ageing' || road.class === 'stale')
    ? `${name} · ${t.time.age(Math.max(0, nowS - road.lastObservedAtS))}`
    : name;
}

export function CoverageChip({ road, nowS }: { road: Pick<RoadCoverage, 'class' | 'lastObservedAtS'>; nowS: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-meta font-medium text-ink-on-shell-muted" data-coverage={road.class}>
      <CoverageSwatch cls={road.class} />
      {coverageLabel(road, nowS)}
    </span>
  );
}
