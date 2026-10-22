import { create } from 'zustand';
import type { LatLng } from '@vighnaway/contracts';

/** Foreground location permission: 'approximate' is Android 12+ / iOS reduced accuracy (about 2 km). */
export type LocationPermission = 'unknown' | 'denied' | 'approximate' | 'precise';

/** The phone's latest position, with its accuracy radius in metres. */
export interface DevicePosition extends LatLng {
  accuracyM: number | null;
}

/** Transient UI state shared across routes (never persisted). */
interface UiState {
  /** Centre of the visible map, for "Use map centre" in Report. */
  mapCenter: LatLng | null;
  mapStatus: 'loading' | 'ready' | 'unavailable';
  locationPermission: LocationPermission;
  /** Latest fix from the map's location layer or a location request; display and recentring only. */
  devicePosition: DevicePosition | null;
  /** Incremented to ask the map to centre on the phone. */
  recenterRequest: number;
  /**
   * While a trip runs the camera follows the vehicle (zoomed in, tilted, turned to the heading, like
   * Google Maps). Panning the map turns it off; the re-centre button turns it back on.
   */
  following: boolean;
  setFollowing: (on: boolean) => void;
  setMapCenter: (c: LatLng) => void;
  setMapStatus: (s: UiState['mapStatus']) => void;
  setLocationPermission: (p: LocationPermission) => void;
  setDevicePosition: (p: DevicePosition) => void;
  requestRecenter: () => void;
}

export const useUi = create<UiState>()((set, get) => ({
  mapCenter: null,
  mapStatus: 'loading',
  locationPermission: 'unknown',
  devicePosition: null,
  recenterRequest: 0,
  following: false,
  setFollowing: (following) => set({ following }),
  setMapCenter: (mapCenter) => set({ mapCenter }),
  setMapStatus: (mapStatus) => set({ mapStatus }),
  setLocationPermission: (locationPermission) => set({ locationPermission }),
  setDevicePosition: (devicePosition) => set({ devicePosition }),
  requestRecenter: () => set({ recenterRequest: get().recenterRequest + 1 }),
}));
