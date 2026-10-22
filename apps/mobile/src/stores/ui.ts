import { create } from 'zustand';
import type { LatLng } from '@vighnaway/contracts';

/** Transient UI state shared across routes (never persisted). */
interface UiState {
  /** Centre of the visible map, for "Use map centre" in Report. */
  mapCenter: LatLng | null;
  mapStatus: 'loading' | 'ready' | 'unavailable';
  setMapCenter: (c: LatLng) => void;
  setMapStatus: (s: UiState['mapStatus']) => void;
}

export const useUi = create<UiState>()((set) => ({
  mapCenter: null,
  mapStatus: 'loading',
  setMapCenter: (mapCenter) => set({ mapCenter }),
  setMapStatus: (mapStatus) => set({ mapStatus }),
}));
