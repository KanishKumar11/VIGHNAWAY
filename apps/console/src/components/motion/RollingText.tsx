'use client';

import { cn } from '@/lib/cn';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Odometer text: every digit is a column that rolls to its new value (transform only), other
 * characters stay put. Columns are keyed from the right so "9 min" to "10 min" adds a column
 * instead of shifting every digit. Instant under reduced motion (globals.css).
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={cn('relative inline-flex tabular', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((c, i) => {
          const key = chars.length - i;
          const d = DIGITS.indexOf(c);
          if (d < 0) {
            return (
              <span key={`c${key}`} className="whitespace-pre">
                {c}
              </span>
            );
          }
          return (
            <span key={`d${key}`} className="relative inline-block h-[1lh] overflow-hidden">
              <span className="invisible">0</span>
              <span className="vw-digit-col absolute inset-x-0 top-0 flex flex-col" style={{ transform: `translateY(${-d * 10}%)` }}>
                {DIGITS.map((n) => (
                  <span key={n} className="block h-[1lh] text-center">
                    {n}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
