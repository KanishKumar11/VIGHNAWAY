'use client';

import type { Incident, IncidentStatus } from '@vighnaway/contracts';
import { Clock, FlaskConical, Radio, Split, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { incidentFacts } from '@/lib/incidents';

const chip = 'inline-flex h-7 items-center gap-1.5 rounded-chip px-2.5 text-meta font-semibold whitespace-nowrap';

/** Tiny ring in the marker language: dashed, double, solid, struck. */
export function RingIcon({ status, className }: { status: IncidentStatus; className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0', className)} aria-hidden fill="none" stroke="currentColor">
      {status === 'unverified' && <circle cx={7} cy={7} r={5.5} strokeWidth={1.6} strokeDasharray="2.2 1.8" />}
      {status === 'corroborated' && (
        <>
          <circle cx={7} cy={7} r={5.6} strokeWidth={1.3} />
          <circle cx={7} cy={7} r={3.1} strokeWidth={1.3} />
        </>
      )}
      {status === 'verified' && <circle cx={7} cy={7} r={5.2} strokeWidth={2.4} />}
      {(status === 'resolved' || status === 'dismissed') && (
        <>
          <circle cx={7} cy={7} r={5.5} strokeWidth={1.4} />
          <path d="M3 11 11 3" strokeWidth={1.4} />
        </>
      )}
    </svg>
  );
}

/**
 * Status chip in the state treatments (DESIGN_VISION 4.3) and the ring language. Unverified and
 * Corroborated share the warning treatment and differ by ring and label. Evidence builds up once
 * on change: a device dot joins, the ring closes, an operator Verify lands like a stamp.
 */
export function StatusChip({ incident }: { incident: Incident }) {
  const label = incidentFacts(incident, 0).status;
  const s = incident.status;
  const devices = incident.source === 'live_feed' ? 0 : Math.min(incident.deviceCount, 4);
  const building = s === 'unverified' || s === 'corroborated';
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={s}
        initial={s === 'verified' ? { scale: 1.25, opacity: 0, rotate: -4 } : { scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 360 }}
        className={cn(
          chip,
          building && 'bg-warn-surface text-warn-ink',
          s === 'verified' && 'bg-danger-surface text-danger-ink',
          (s === 'resolved' || s === 'dismissed') && 'bg-panel-sunken text-ink-muted line-through',
        )}
      >
        <RingIcon status={s} />
        {label}
        {building && devices > 0 && (
          <span aria-hidden className="ml-0.5 flex gap-0.5">
            <AnimatePresence initial={false}>
              {Array.from({ length: devices }, (_, i) => (
                <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 14, stiffness: 420 }} className="size-1.5 rounded-chip bg-current" />
              ))}
            </AnimatePresence>
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

/** Neutral badge: the simulated designation stays visible throughout the demonstration. */
export function SimulatedBadge({ onShell = false, className }: { onShell?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-chip border border-shell-line bg-panel-sunken px-2.5 text-meta font-semibold whitespace-nowrap',
        onShell ? 'text-ink-on-shell' : 'text-ink',
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {t.app.simulated}
    </span>
  );
}

/** Source, status and age travel with every incident. */
export function EvidenceChips({ incident, nowS }: { incident: Incident; nowS: number }) {
  const f = incidentFacts(incident, nowS);
  const SourceIcon = incident.source === 'live_feed' ? Radio : UserRound;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusChip incident={incident} />
      {incident.source === 'simulated' ? (
        <SimulatedBadge onShell />
      ) : (
        <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-on-shell">
          <SourceIcon aria-hidden className="size-3.5 text-ink-on-shell-muted" />
          {f.source}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-on-shell-muted tabular">
        <Clock aria-hidden className="size-3.5" />
        {f.age}
      </span>
      {f.stale && (
        <span className={cn(chip, 'bg-warn-surface text-warn-ink')} title={t.queue.staleHint}>
          <Clock aria-hidden className="size-3.5" />
          {t.queue.stale}
        </span>
      )}
      {incident.audienceOnly && (
        <span className={cn(chip, 'bg-panel-sunken text-ink-on-shell')} data-testid="audience-chip">
          <UserRound aria-hidden className="size-3.5" />
          {t.audience.chip}
        </span>
      )}
      {incident.conflicting && (
        <span className={cn(chip, 'bg-warn-surface text-warn-ink')}>
          <Split aria-hidden className="size-3.5" />
          {t.queue.conflicting}
        </span>
      )}
    </div>
  );
}
