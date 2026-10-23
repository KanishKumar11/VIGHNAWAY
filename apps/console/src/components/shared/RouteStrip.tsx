import type { RouteEvaluation } from '@vighnaway/contracts';
import { Hospital } from 'lucide-react';
import { Fragment } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { IncidentGlyph } from './IncidentGlyph';

const pct = (m: number, total: number) => `${Math.max(0, Math.min(100, (m / Math.max(1, total)) * 100)).toFixed(2)}%`;

/**
 * Route strip (DESIGN.md section 5): the route from origin to destination as a slim bar, with
 * hazard ticks at their real positions and the crossing labelled. Same idea as the phone's.
 */
export function RouteStrip({ route, compact = false }: { route: RouteEvaluation; compact?: boolean }) {
  const total = route.distanceM;
  const active = route.hazards.filter((h) => h.effect !== 'none');
  const blocked = route.role === 'blocked' || !route.viable;
  const bar = route.role === 'recommended' ? 'bg-route-recommended' : 'bg-route-muted';
  // Labels sit in one row, first crossing to last, so long names can never overlap; the crossings
  // in between are counted (the screen-reader text, routeStripText, still lists every one).
  const ordered = [...route.crossings].sort((a, b) => a.positionM - b.positionM);
  const labelled = ordered.length > 2 ? [ordered[0]!, ordered[ordered.length - 1]!] : ordered;
  const hidden = ordered.length - labelled.length;
  return (
    <div className="w-full" aria-hidden>
      <div className={cn('relative mx-1', compact ? 'h-6' : 'h-8')}>
        {blocked ? (
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-danger" />
        ) : (
          <div className={cn('absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-chip', bar, route.role === 'alternative' && 'opacity-60')} />
        )}
        {route.crossings.map((c) => (
          <div
            key={`${c.name}-${c.positionM}`}
            className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-chip border-2 border-ink bg-panel-raised"
            style={{ left: pct(c.positionM, total), width: `max(calc(var(--spacing) * 3), ${pct(c.lengthM, total)})` }}
          />
        ))}
        {route.dataGaps.map((g) => (
          <div
            key={`gap-${g.edgeId}`}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-chip border-2 border-dotted border-flood-prone-solid bg-panel-raised"
            style={{ left: pct(g.positionM, total) }}
          />
        ))}
        <span className="absolute top-1/2 left-0 size-3.5 -translate-y-1/2 rounded-chip border-[3px] border-panel-raised bg-route-recommended shadow-sm" />
        <span className="absolute top-1/2 right-0 flex size-7 -translate-y-1/2 items-center justify-center rounded-button bg-ink text-panel shadow-sm">
          <Hospital className="size-4" />
        </span>
        {active.map((h) => (
          <span
            key={h.incidentId}
            className={cn(
              'absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-chip border-2 shadow-sm',
              compact ? 'size-7' : 'size-8',
              'bg-white',
              h.effect === 'block' ? 'border-danger' : h.status === 'corroborated' ? 'border-corroborated' : 'border-warn',
              h.status === 'unverified' && 'border-dashed',
            )}
            style={{ left: pct(h.positionM, total) }}
          >
            <IncidentGlyph type={h.type} className={compact ? 'size-4' : 'size-5'} />
          </span>
        ))}
      </div>
      {!compact && route.crossings.length > 0 && (
        <div className="mx-1 mt-2 flex items-baseline justify-between gap-3 text-meta text-ink-muted">
          {labelled.map((c, i) => (
            <Fragment key={`l-${c.name}-${c.positionM}`}>
              {i === 1 && hidden > 0 && <span className="shrink-0 tabular">+{hidden}</span>}
              <span className={cn('min-w-0 truncate', i > 0 && 'text-right')}>
                <span className="font-semibold text-ink">{c.name}</span> · {t.route.strip.kinds[c.kind]}
              </span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** Screen-reader text for a strip. */
export function routeStripText(route: RouteEvaluation): string {
  const parts = route.crossings.map((c) => `${c.name} (${t.route.strip.kinds[c.kind]})`);
  return parts.join(', ');
}
