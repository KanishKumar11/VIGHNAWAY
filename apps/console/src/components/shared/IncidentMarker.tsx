'use client';

import type { Incident } from '@vighnaway/contracts';
import { motion as motionTokens } from '@vighnaway/tokens';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { usePulse } from '@/hooks/usePulse';
import { IncidentGlyph } from './IncidentGlyph';
import { StatusRing } from './StatusRing';

const spring = { type: 'spring' as const, ...motionTokens.springSnappy };

/**
 * Incident marker: the glyph shows the type, the ring shows verification (dashed Unverified,
 * double Corroborated, solid Verified, struck Closed), the pill shows age. Drops in once; the
 * ring morphs on a status change; Verify lands once like a stamp. Nothing loops.
 */
export function IncidentMarker({
  incident,
  nowS,
  pulseKey,
  selected,
  onSelect,
}: {
  incident: Incident;
  nowS: number;
  pulseKey: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  usePulse(ref, pulseKey);
  const s = incident.status;
  const closed = s === 'resolved' || s === 'dismissed';
  const age = t.time.age(nowS - incident.lastReportAtS);
  const label = [t.evidence.hazard(incident), t.evidence.status(incident), t.evidence.source(incident), age, incident.roadName ?? ''].filter(Boolean).join(', ');
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
            'absolute inset-0 flex items-center justify-center rounded-chip shadow-sm',
            s === 'verified' ? 'bg-danger text-white' : closed ? 'bg-shell-raised text-resolved' : 'bg-shell-raised text-warn',
          )}
        >
          <IncidentGlyph type={incident.type} className="size-5" />
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
