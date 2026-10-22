'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { motion } from '@vighnaway/tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Pulses an element twice whenever `pulseKey` increases (operator verify: the incident card and
 * its marker pulse together). Uses the Web Animations API so the element keeps focus.
 */
export function usePulse(ref: RefObject<HTMLElement | null>, pulseKey: number): void {
  const reduced = useReducedMotion();
  const last = useRef(pulseKey);
  useEffect(() => {
    if (pulseKey === last.current) return;
    last.current = pulseKey;
    const el = ref.current;
    if (reduced || !el || typeof el.animate !== 'function') return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], {
      duration: motion.statusUpgrade * 2,
      iterations: 2,
      easing: 'ease-in-out',
    });
  }, [pulseKey, reduced, ref]);
}
