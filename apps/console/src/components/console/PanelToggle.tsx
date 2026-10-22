'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  /** Which edge of the map stage the tab sits on; the column it folds is on that side. */
  side: 'left' | 'right';
  hidden: boolean;
  onToggle(): void;
  /** Accessible name, e.g. "Hide incident queue". */
  label: string;
  controls: string;
}

/**
 * Edge tab on the map stage that folds a side column away and back, so the map can take the
 * width. The arrow points the way the column will move.
 */
export function PanelToggle({ side, hidden, onToggle, label, controls }: Props) {
  const pointsLeft = hidden === (side === 'right');
  const Arrow = pointsLeft ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-expanded={!hidden}
      aria-controls={controls}
      className={cn(
        'vw-press surface absolute top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center text-ink-on-shell-muted hover:text-ink-on-shell',
        side === 'left'
          ? 'left-0 rounded-l-none rounded-r-button border-l-0'
          : 'right-0 rounded-r-none rounded-l-button border-r-0',
      )}
    >
      <Arrow aria-hidden className="size-4" />
    </button>
  );
}
