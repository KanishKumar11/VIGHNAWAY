import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A control that answers at once. The new value is shown in the same frame as the touch; the real change (a store write
 * that redraws the theme, the language or a whole screen) is made two frames later, so the control never waits for it.
 * The value from the store wins whenever it changes, so a change that was refused snaps back.
 */
export function useInstantValue<T>(value: T, apply: (next: T) => void): [T, (next: T) => void] {
  const [shown, setShown] = useState(value);
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => setShown(value), [value]);
  const change = useCallback((next: T) => {
    setShown(next);
    requestAnimationFrame(() => requestAnimationFrame(() => latest.current(next)));
  }, []);
  return [shown, change];
}
