'use client';

import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const OFFSET = 32;

/**
 * Fades and slides its content in each time it enters the viewport, from the side it entered on:
 * rising from below while scrolling down, dropping from above while scrolling back up.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.15 });
  // Which side of the viewport the element is waiting on: 1 below, -1 above.
  const [side, setSide] = useState<1 | -1>(1);
  useEffect(() => {
    if (!inView && ref.current) setSide(ref.current.getBoundingClientRect().top < 0 ? -1 : 1);
  }, [inView]);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: OFFSET, scale: 0.97 }}
      animate={
        inView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: side * OFFSET, scale: 0.97 }
      }
      transition={{ duration: 0.55, delay: inView ? delay : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
