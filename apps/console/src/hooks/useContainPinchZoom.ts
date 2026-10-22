'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Keeps a trackpad pinch over the element from zooming the whole page. A pinch arrives as a wheel
 * event with ctrlKey set (Safari sends gesture events); the browser zooms the page unless it is
 * cancelled. The listener runs after the map's own handlers (bubble phase, non-passive), so the
 * map still zooms. Outside the element, browser zoom keeps working.
 */
export function useContainPinchZoom(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    const gestures = ['gesturestart', 'gesturechange', 'gestureend'] as const;
    el.addEventListener('wheel', onWheel, { passive: false });
    for (const g of gestures) el.addEventListener(g, onGesture);
    return () => {
      el.removeEventListener('wheel', onWheel);
      for (const g of gestures) el.removeEventListener(g, onGesture);
    };
  }, [ref]);
}
