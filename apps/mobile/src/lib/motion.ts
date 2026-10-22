import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Reduce-motion flag shared by non-React code (the route-change timeline) and components. */
let reduceMotion = false;
const listeners = new Set<(v: boolean) => void>();

try {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      reduceMotion = v;
      listeners.forEach((l) => l(v));
    })
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => {
    reduceMotion = v;
    listeners.forEach((l) => l(v));
  });
} catch {
  // Not available (tests): keep motion on.
}

export const isReduceMotion = (): boolean => reduceMotion;

export function useReduceMotion(): boolean {
  const [v, setV] = useState(reduceMotion);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

/** Duration helper: zero when reduce motion is on. */
export const dur = (ms: number): number => (reduceMotion ? 0 : ms);
