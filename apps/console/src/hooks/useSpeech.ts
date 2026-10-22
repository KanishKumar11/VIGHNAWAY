'use client';

import { spokenChange } from '@vighnaway/engine';
import { useEffect, useRef } from 'react';
import type { TripState } from '@/lib/demoTrip';
import { usePrefs } from '@/stores/prefs';

/** Text to speak for a trip's latest change: the engine's spoken line, else the change message. */
export function spokenText(trip: TripState | null): string | null {
  if (!trip?.change) return null;
  return spokenChange(trip.plan) ?? trip.change.message;
}

export const speechAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Speaks each new route change once, when the viewer turned spoken changes on (off by default).
 * The engine's sentences are English, so they are spoken with an Indian English voice.
 */
export function useSpokenChanges(trip: TripState | null): void {
  const on = usePrefs((s) => s.speech);
  const last = useRef<number | null>(trip?.change?.id ?? null);
  const id = trip?.change?.id ?? null;
  useEffect(() => {
    if (id === null || id === last.current) return;
    last.current = id;
    const text = spokenText(trip);
    if (!on || !text || !speechAvailable()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, on]);
}
