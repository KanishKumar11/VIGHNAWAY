import { useId } from 'react';
import { cn } from '@/lib/cn';

/** The mark: a route line bending around an obstacle (DESIGN.md section 8), on the brand gradient. */
export function BrandMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--vw-brand-from)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--vw-brand-via)' }} />
          <stop offset="1" style={{ stopColor: 'var(--vw-brand-to)' }} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={32} height={32} rx={9} fill={`url(#${id})`} />
      <circle cx={16} cy={18.5} r={2.6} className="stroke-on-brand" strokeOpacity={0.75} strokeWidth={1.6} />
      <path d="M8 25V17a8 8 0 0 1 16 0v8" className="stroke-on-brand" strokeWidth={2.8} />
      <circle cx={8} cy={25} r={2} className="fill-on-brand" />
      <circle cx={24} cy={25} r={2} className="fill-on-brand" />
    </svg>
  );
}
