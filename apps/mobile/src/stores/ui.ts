import { create } from 'zustand';
import type { LatLng } from '@vighnaway/contracts';

/** Foreground location permission: 'approximate' is Android 12+ / iOS reduced accuracy (about 2 km). */
export type LocationPermission = 'unknown' | 'denied' | 'approximate' | 'precise';

/** The phone's latest position, with its accuracy radius in metres. */
export interface DevicePosition extends LatLng {
  accuracyM: number | null;
}

/**
 * Where "start from where you are" stands (live mode): not started, finding the phone, done, or why it
 * could not be done (permission never asked, refused, the phone is outside every road map, no fix).
 */
export type StartHere = 'idle' | 'locating' | 'ready' | 'needs_permission' | 'denied' | 'outside' | 'unavailable';

/** A request to fly the map camera somewhere; each request has a new nonce so the same place can be asked twice. */
export interface CameraRequest {
  center: LatLng;
  zoom: number;
  nonce: number;
}

/** Transient UI state shared across routes (never persisted). */
interface UiState {
  /** Centre of the visible map, for "Use map centre" in Report. */
  mapCenter: LatLng | null;
  mapStatus: 'loading' | 'ready' | 'unavailable';
  locationPermission: LocationPermission;
  /** Latest fix from the map's location layer or a location request; display and recentring only. */
  devicePosition: DevicePosition | null;
  /** Direction of travel from GPS, degrees from north; null until the phone is moving. Display only. */
  deviceCourse: number | null;
  /**
   * What the location button last did, like Google Maps: it centres north-up, then turns the map to the
   * direction the phone travels, then straightens it again. Dragging the map sets it to free.
   */
  locateMode: 'free' | 'north' | 'heading';
  setLocateMode: (m: 'free' | 'north' | 'heading') => void;
  /** Incremented to ask the map to centre on the phone. */
  recenterRequest: number;
  /**
   * While a trip runs the camera follows the vehicle (zoomed in, tilted, turned to the heading, like
   * Google Maps). Panning the map turns it off; the re-centre button turns it back on.
   */
  following: boolean;
  setFollowing: (on: boolean) => void;
  startHere: StartHere;
  setStartHere: (s: StartHere) => void;
  cameraRequest: CameraRequest | null;
  requestCamera: (center: LatLng, zoom: number) => void;
  setMapCenter: (c: LatLng) => void;
  setMapStatus: (s: UiState['mapStatus']) => void;
  setLocationPermission: (p: LocationPermission) => void;
  setDevicePosition: (p: DevicePosition) => void;
  setDeviceCourse: (h: number | null) => void;
  requestRecenter: () => void;
}

export const useUi = create<UiState>()((set, get) => ({
  mapCenter: null,
  mapStatus: 'loading',
  locationPermission: 'unknown',
  devicePosition: null,
  deviceCourse: null,
  locateMode: 'free',
  setLocateMode: (locateMode) => set({ locateMode }),
  recenterRequest: 0,
  startHere: 'idle',
  setStartHere: (startHere) => set({ startHere }),
  cameraRequest: null,
  requestCamera: (center, zoom) => set({ cameraRequest: { center, zoom, nonce: (get().cameraRequest?.nonce ?? 0) + 1 } }),
  following: false,
  setFollowing: (following) => set({ following }),
  setMapCenter: (mapCenter) => set({ mapCenter }),
  setMapStatus: (mapStatus) => set({ mapStatus }),
  setLocationPermission: (locationPermission) => set({ locationPermission }),
  setDevicePosition: (devicePosition) => set({ devicePosition }),
  setDeviceCourse: (deviceCourse) => set({ deviceCourse }),
  requestRecenter: () => set({ recenterRequest: get().recenterRequest + 1 }),
}));
