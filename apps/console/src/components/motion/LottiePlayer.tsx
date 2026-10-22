'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// lottie-web touches the DOM (and a canvas) when it loads: browser only. The chunk is fetched as
// soon as this module loads, so the short "evaluating" state never waits for it.
const load = () => import('./LottieInner');
if (typeof window !== 'undefined') load().catch(() => undefined);
const LottieInner = dynamic(load, { ssr: false });

/**
 * Plays a shared Lottie (packages/tokens/lottie). Under reduced motion it never animates and
 * shows its final frame.
 */
export function LottiePlayer({ data, loop = false, className, onComplete }: { data: object & { op: number }; loop?: boolean; className?: string; onComplete?: () => void }) {
  const reduced = useReducedMotion();
  return (
    <span aria-hidden className={cn('inline-block', className)}>
      <LottieInner data={data} loop={loop} reduced={reduced} onComplete={onComplete} />
    </span>
  );
}
