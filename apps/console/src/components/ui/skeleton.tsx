import { cn } from '@/lib/cn';

/** Shimmering placeholder shaped like the content it stands for (motion.skeletonShimmer). */
export function Skeleton({ className, onPanel = false }: { className?: string; onPanel?: boolean }) {
  return <span aria-hidden className={cn('block rounded-button', onPanel ? 'vw-skeleton-panel' : 'vw-skeleton', className)} />;
}
