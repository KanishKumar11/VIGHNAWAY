import { cn } from '@/lib/cn';

/** The mark: a route line bending around an obstacle (DESIGN.md section 8), on solid brand indigo. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={0} y={0} width={32} height={32} rx={9} className="fill-brand-from" />
      <circle cx={16} cy={18.5} r={2.6} className="stroke-on-brand" strokeOpacity={0.75} strokeWidth={1.6} />
      <path d="M8 25V17a8 8 0 0 1 16 0v8" className="stroke-on-brand" strokeWidth={2.8} />
      <circle cx={8} cy={25} r={2} className="fill-on-brand" />
      <circle cx={24} cy={25} r={2} className="fill-on-brand" />
    </svg>
  );
}
