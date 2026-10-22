import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { setPlanningPaused } from '@/features/trip/planner';

/**
 * Call from a screen that does not show the map: while it is in front the route engine does not re-plan (see
 * features/trip/planGate.ts), and the plan it owes is made when the map is back in front.
 */
export function usePausePlanning(): void {
  useFocusEffect(
    useCallback(() => {
      setPlanningPaused(true);
      return () => setPlanningPaused(false);
    }, []),
  );
}
