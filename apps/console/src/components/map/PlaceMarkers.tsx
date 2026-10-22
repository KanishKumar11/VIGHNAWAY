'use client';

import type { Place } from '@vighnaway/contracts';
import { motion as motionTokens } from '@vighnaway/tokens';
import { Hospital, X } from 'lucide-react';
import { motion } from 'motion/react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { LabelSide } from '@/lib/mapLabels';

const spring = { type: 'spring' as const, ...motionTokens.springSoft };

/** Place name chip under a marker (navy halo chip, never over the route colour). */
function PlaceLabel({ children, strong, side = 'center', above = false }: { children: string; strong?: boolean; side?: LabelSide; above?: boolean }) {
  return (
    <span
      className={cn(
        'absolute rounded-chip',
        above ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        'border border-shell-hairline bg-shell-raised px-2 py-px text-meta whitespace-nowrap font-semibold shadow-sm',
        side === 'center' && 'left-1/2 -translate-x-1/2',
        side === 'start' && '-left-2',
        side === 'end' && '-right-2',
        strong ? 'text-ink-on-shell' : 'text-ink-on-shell-muted',
      )}
    >
      {children}
    </span>
  );
}

/** Origin: teal dot with a slow ripple. */
export function OriginMarker({ place, showLabel = true, side }: { place: Place; showLabel?: boolean; side?: LabelSide }) {
  return (
    <span className="relative flex flex-col items-center" role="img" aria-label={`${t.map.origin}: ${place.name}`}>
      <span className="relative flex size-5 items-center justify-center">
        <span aria-hidden className="relative size-4 rounded-chip border-[3px] border-route-casing bg-route-recommended shadow-sm" />
      </span>
      {showLabel && (
        <PlaceLabel strong side={side}>
          {place.name}
        </PlaceLabel>
      )}
    </span>
  );
}

/** Destination: cream pin with a hospital cross. Other hospitals are smaller and muted. */
export function HospitalMarker({ place, active, showLabel = true, side, above }: { place: Place; active: boolean; showLabel?: boolean; side?: LabelSide; above?: boolean }) {
  return (
    <motion.span
      className="relative flex origin-bottom flex-col items-center"
      role="img"
      aria-label={place.name}
      initial={false}
      animate={{ scale: active ? 1 : 0.86, opacity: active ? 1 : 0.85 }}
      transition={spring}
    >
      <span className="relative flex flex-col items-center">
        <span
          className={cn(
            'flex items-center justify-center rounded-button shadow-md',
            active ? 'size-10 bg-panel-raised text-ink ring-2 ring-route-recommended ring-offset-2 ring-offset-shell' : 'size-8 border border-shell-hairline-strong bg-shell-overlay text-ink-on-shell-muted',
          )}
        >
          <Hospital aria-hidden className={active ? 'size-5' : 'size-4'} strokeWidth={2.2} />
        </span>
        <span aria-hidden className={cn('-mt-px h-2 w-0.5 rounded-chip', active ? 'bg-route-recommended' : 'bg-ink-on-shell-muted')} />
      </span>
      {showLabel && (
        <PlaceLabel strong={active} side={side} above={above}>
          {place.name}
        </PlaceLabel>
      )}
    </motion.span>
  );
}

/** Demo vehicle: teal disc with a heading arrow and a flat heading wedge. */
export function VehicleMarker({ headingDeg }: { headingDeg: number }) {
  return (
    <span role="img" aria-label={t.map.vehicle} className="relative flex size-24 items-center justify-center">
      <svg viewBox="0 0 96 96" className="absolute inset-0 transition-transform duration-1000 ease-linear" style={{ transform: `rotate(${headingDeg}deg)` }} aria-hidden>
        <path d="M48 48 L34 14 A36 36 0 0 1 62 14 Z" fill="var(--vw-teal-glow)" />
      </svg>
      <span className="relative flex size-7 items-center justify-center rounded-chip border-[3px] border-route-casing bg-route-recommended shadow-md">
        <svg viewBox="0 0 24 24" className="size-4 transition-transform duration-1000 ease-linear" style={{ transform: `rotate(${headingDeg}deg)` }} aria-hidden>
          <path d="M12 3 19 20 12 16 5 20Z" className="fill-route-casing" />
        </svg>
      </span>
    </span>
  );
}

/** Cross marker on the segment that makes a route not viable, with the words. */
export function BlockedCross({ label, left = false }: { label: string; left?: boolean }) {
  return (
    <motion.span
      className={cn('flex items-center gap-1.5', left && 'flex-row-reverse')}
      role="img"
      aria-label={`${t.route.notViable}: ${label}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', ...motionTokens.springSnappy }}
    >
      <span className="flex size-6 items-center justify-center rounded-chip border-2 border-shell-raised bg-danger text-white">
        <X aria-hidden className="size-3.5" strokeWidth={3.5} />
      </span>
      <span className="rounded-chip border border-danger bg-danger-surface px-2 py-0.5 text-meta font-semibold text-danger-ink">{t.route.notViable}</span>
    </motion.span>
  );
}
