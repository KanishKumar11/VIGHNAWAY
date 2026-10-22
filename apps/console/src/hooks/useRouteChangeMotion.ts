'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from '@vighnaway/tokens';
import type { TripChange } from '@/lib/demoTrip';
import { useReducedMotion } from './useReducedMotion';

/**
 * The route-change moment (DESIGN.md section 6), same sequence as the phone:
 * 1. the blocking segment flashes red twice (flash on/off, routeChangeFlash ms each);
 * 2. the old route dims to slate and thins while the new route fades in;
 * 3. the banner slides in and the ETA rolls to the new value.
 * Total routeChangeTotal ms. Instant when reduced motion is on.
 */
export type MotionPhase = 'idle' | 'flash' | 'transition' | 'settled';

export interface RouteMotion {
  phase: MotionPhase;
  flashOn: boolean;
  change: TripChange | null;
}

export function routeMotionTimeline(): { atMs: number; phase: MotionPhase; flashOn: boolean }[] {
  const f = motion.routeChangeFlash;
  return [
    { atMs: 0, phase: 'flash', flashOn: true },
    { atMs: f, phase: 'flash', flashOn: false },
    { atMs: 2 * f, phase: 'flash', flashOn: true },
    { atMs: 3 * f, phase: 'flash', flashOn: false },
    { atMs: 4 * f, phase: 'transition', flashOn: false },
    { atMs: motion.routeChangeTotal, phase: 'settled', flashOn: false },
  ];
}

export function useRouteChangeMotion(change: TripChange | null): RouteMotion {
  const reduced = useReducedMotion();
  const [state, setState] = useState<RouteMotion>({ phase: 'idle', flashOn: false, change: null });
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (!change) {
      lastId.current = null;
      setState({ phase: 'idle', flashOn: false, change: null });
      return;
    }
    if (change.id === lastId.current) return;
    lastId.current = change.id;
    if (reduced) {
      setState({ phase: 'settled', flashOn: false, change });
      return;
    }
    const timers = routeMotionTimeline().map((step) =>
      setTimeout(() => setState({ phase: step.phase, flashOn: step.flashOn, change }), step.atMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [change, reduced]);

  return state;
}

/** Rolls a number from its previous value to the new one (the ETA roll). */
export function useRollingNumber(value: number | null, durationMs: number = motion.routeChangeTotal - 4 * motion.routeChangeFlash): number | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (value === null || from.current === null || reduced || from.current === value || typeof requestAnimationFrame === 'undefined') {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - k) * (1 - k);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, reduced, durationMs]);

  return shown;
}
