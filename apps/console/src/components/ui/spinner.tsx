import { cn } from '@/lib/cn';

/** A small ring that turns: for a button or line waiting on the server. Takes its colour from the text. */
export function Spinner({ className, thin = false }: { className?: string; thin?: boolean }) {
  const w = thin ? 1.5 : 3;
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={cn('vw-spin size-5 shrink-0', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth={w} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}
