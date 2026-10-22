'use client';

import { routeStyles } from '@vighnaway/tokens';
import { ChevronUp, Info, Layers } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { Insets } from '@/lib/projection';
import { ATTRIBUTION } from '@/lib/scenario';
import { themeVar } from '@/lib/theme';

type SwatchKind = 'recommended' | 'usual_fastest' | 'alternative' | 'blocked' | 'travelled' | 'floodProne' | 'railway' | 'slow' | 'jam';

/** Same dash as the map's static speed stripes (SchematicMap FLOW_DASH). */
const SPEED_DASH = { slow: '2 10', jam: '3 4' } as const;

function Swatch({ kind }: { kind: SwatchKind }) {
  if (kind === 'slow' || kind === 'jam') {
    const s = routeStyles.recommended;
    return (
      <svg viewBox="0 0 28 10" className="h-2.5 w-7" aria-hidden>
        {s.casing && <path d="M3 5H25" stroke={themeVar(s.casing)} strokeWidth={s.casingWidth} strokeLinecap="round" />}
        <path d="M3 5H25" stroke={themeVar(s.color)} strokeWidth={s.width} strokeLinecap="round" />
        <path d="M3 5H25" stroke={themeVar(s.casing ?? s.color)} strokeWidth={2} strokeDasharray={SPEED_DASH[kind]} />
      </svg>
    );
  }
  if (kind === 'railway') {
    return (
      <svg viewBox="0 0 28 10" className="h-2.5 w-7" aria-hidden>
        <path d="M1 5H27" className="stroke-railway" strokeWidth={6} strokeDasharray="1.2 4.5" opacity={0.5} />
        <path d="M1 5H27" className="stroke-railway" strokeWidth={1.4} />
      </svg>
    );
  }
  const s = routeStyles[kind];
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7" aria-hidden>
      {s.casing && <path d="M3 5H25" stroke={themeVar(s.casing)} strokeWidth={s.casingWidth} strokeLinecap="round" />}
      <path
        d="M3 5H25"
        stroke={themeVar(s.color)}
        strokeWidth={kind === 'floodProne' ? s.width : s.width}
        strokeOpacity={s.opacity}
        strokeLinecap="round"
        strokeDasharray={kind === 'floodProne' ? '0.1 6' : s.dash ? '5 4' : undefined}
      />
    </svg>
  );
}

const ITEMS = () => [
  ['recommended', t.map.legend.recommended],
  ['usual_fastest', t.map.legend.usual],
  ['alternative', t.map.legend.alternative],
  ['blocked', t.map.legend.blocked],
  ['travelled', t.map.legend.travelled],
  ['floodProne', t.map.legend.floodProne],
  ['railway', t.map.legend.railway],
] as const;
const SPEED_ITEMS = () => [
  ['slow', t.map.legend.slow],
  ['jam', t.map.legend.jam],
] as const;

/**
 * Corner legend chip: "Schematic view, not a map". Expands to the route legend, the map-fallback
 * notice and the data attribution. Status stays quiet until asked for (DESIGN.md 11.1).
 */
export function MapLegend({
  unavailable,
  compact,
  schematic = true,
  extraAttribution = null,
}: {
  unavailable: boolean;
  compact: boolean;
  /** The camera's insets (unused: the docked stage keeps its corners free). */
  insets?: Insets;
  schematic?: boolean;
  extraAttribution?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Docked map stage: the legend and the attribution sit in its corners, below the camera's inset.
  const style = compact ? { left: 8, bottom: 8 } : { left: 16, bottom: 14 };
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute flex flex-col items-start gap-2" style={style}>
        <AnimatePresence>
          {open && (
            <motion.div
              id="map-legend"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="surface w-80 origin-bottom-left rounded-card p-4 text-meta text-ink-on-shell"
            >
              <p className="font-semibold text-ink-on-shell-muted">{t.map.legendTitle}</p>
              <ul className="mt-2 grid grid-cols-1 gap-1.5">
                {ITEMS().map(([k, label]) => (
                  <li key={k} className="flex items-center gap-3">
                    <Swatch kind={k} />
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-shell-hairline pt-3 font-semibold text-ink-on-shell-muted">{t.map.legend.speedTitle}</p>
              <ul className="mt-2 grid grid-cols-1 gap-1.5">
                {SPEED_ITEMS().map(([k, label]) => (
                  <li key={k} className="flex items-center gap-3">
                    <Swatch kind={k} />
                    {label}
                  </li>
                ))}
              </ul>
              {unavailable && (
                <p role="status" className="mt-3 flex items-start gap-2 border-t border-shell-hairline pt-3 text-ink-on-shell">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
                  {t.map.unavailable}
                </p>
              )}
              <p className="mt-3 border-t border-shell-hairline pt-3 text-ink-on-shell-muted">{ATTRIBUTION}</p>
              {extraAttribution && <p className="mt-1 text-ink-on-shell-muted">{extraAttribution}</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls="map-legend"
          className={cn(
            'vw-press surface flex items-center gap-2 rounded-chip text-ink-on-shell',
            compact ? 'px-2.5 py-1 text-meta' : 'px-3 py-1.5 text-meta font-medium',
          )}
        >
          <Layers aria-hidden className="size-4 text-ink-on-shell-muted" />
          {schematic ? t.map.schematicChip : t.map.legendTitle}
          {unavailable && <span aria-hidden className="size-1.5 rounded-chip bg-warn" />}
          <ChevronUp aria-hidden className={cn('size-4 text-ink-on-shell-muted transition-transform', !open && 'rotate-180')} />
        </button>
      </div>
      {!compact && (schematic || extraAttribution) && (
        <p className="absolute max-w-md rounded-button bg-shell-deep px-2 py-1 text-right text-meta text-ink-on-shell-muted" style={{ right: 12, bottom: 12 }}>
          {schematic && ATTRIBUTION}
          {extraAttribution && (
            <>
              {schematic && <br />}
              {extraAttribution}
            </>
          )}
        </p>
      )}
      {unavailable && <span className="sr-only">{t.map.unavailable}</span>}
    </div>
  );
}
