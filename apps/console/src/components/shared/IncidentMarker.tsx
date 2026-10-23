'use client';

import type { Incident } from '@vighnaway/contracts';
import { motion as motionTokens } from '@vighnaway/tokens';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { MarkerDensity } from '@/lib/incidents';
import { usePulse } from '@/hooks/usePulse';
import { IncidentGlyph } from './IncidentGlyph';
import { StatusRing } from './StatusRing';

const spring = { type: 'spring' as const, ...motionTokens.springSnappy };

/** Compact sizes (spacing steps): the ring-and-glyph marker and the closed-incident dot. */
const COMPACT = 'size-5.5';
const DOT = 'size-2.5';
/*
 * The map anchors a marker by the centre of a full-size circle (--vw-marker-size from the top), so
 * a smaller circle is pushed down by half the difference to stay centred on its location.
 */
const COMPACT_OFFSET = 'mt-[calc((var(--vw-marker-size)-var(--spacing)*5.5)/2)]';
const DOT_OFFSET = 'mt-[calc((var(--vw-marker-size)-var(--spacing)*2.5)/2)]';

/**
 * Incident marker: the glyph shows the type, the ring shows verification (dashed Unverified,
 * double Corroborated, solid Verified, struck Closed), the pill shows age. Drops in once; the
 * ring morphs on a status change; Verify lands once like a stamp. Nothing loops.
 *
 * Compact density (a live feed filling the map): a smaller ring and glyph with no age pill, and
 * closed incidents as a small grey dot. The selected incident always shows in full. The age, status
 * and source stay in the accessible label and in the queue.
 */
export function IncidentMarker({
  incident,
  nowS,
  pulseKey,
  selected,
  onSelect,
  density = 'full',
}: {
  incident: Incident;
  nowS: number;
  pulseKey: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  density?: MarkerDensity;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  usePulse(ref, pulseKey);
  const s = incident.status;
  const closed = s === 'resolved' || s === 'dismissed';
  const age = t.time.age(nowS - incident.lastReportAtS);
  const label = [t.evidence.hazard(incident), t.evidence.status(incident), t.evidence.source(incident), age, incident.roadName ?? ''].filter(Boolean).join(', ');
  const compact = density === 'compact' && !selected;
  if (compact && closed) {
    return (
      <motion.button
        type="button"
        onClick={onSelect ? () => onSelect(incident.id) : undefined}
        aria-label={label}
        aria-pressed={selected}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.45 }}
        transition={spring}
        className={cn('block rounded-chip border-[1.5px] border-resolved bg-shell-raised', DOT, DOT_OFFSET)}
      />
    );
  }
  if (compact) {
    return (
      <motion.button
        type="button"
        onClick={onSelect ? () => onSelect(incident.id) : undefined}
        aria-label={label}
        aria-pressed={selected}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring}
        className={cn('relative block rounded-chip', COMPACT, COMPACT_OFFSET)}
      >
        <span ref={ref} className="absolute inset-0 flex items-center justify-center rounded-chip bg-white shadow-sm">
          <IncidentGlyph type={incident.type} className="size-4" />
        </span>
        <StatusRing status={s} size={22} />
      </motion.button>
    );
  }
  return (
    <motion.button
      type="button"
      onClick={onSelect ? () => onSelect(incident.id) : undefined}
      aria-label={label}
      aria-pressed={selected}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: selected ? 1.15 : 1, opacity: closed ? 0.75 : 1 }}
      transition={spring}
      className="flex origin-[50%_18px] flex-col items-center gap-1 rounded-chip"
    >
      <span ref={ref} className={cn('relative block size-9 rounded-chip', selected && 'outline-2 outline-offset-2 outline-focus')}>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-chip bg-white shadow-sm',
            closed && 'opacity-80',
          )}
        >
          <IncidentGlyph type={incident.type} className="size-6.5" />
        </span>
        <AnimatePresence initial={false}>
          <motion.span
            key={s}
            className="absolute inset-0"
            initial={s === 'verified' ? { opacity: 0, scale: 1.45 } : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={s === 'verified' ? { type: 'spring', damping: 14, stiffness: 380 } : { duration: motionTokens.statusUpgrade / 1000 }}
          >
            <StatusRing status={s} />
          </motion.span>
        </AnimatePresence>
        {pulseKey > 0 && (
          <span key={`r${pulseKey}`} aria-hidden className="pointer-events-none absolute inset-0">
            <span className="vw-verify-ring absolute inset-0 rounded-chip border-2 border-danger" />
          </span>
        )}
      </span>
      <span className="rounded-chip border border-shell-hairline bg-shell-raised px-1.5 text-meta leading-tight font-semibold text-ink-on-shell shadow-sm tabular">{age}</span>
    </motion.button>
  );
}
