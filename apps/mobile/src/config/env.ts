import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Default API base URL; Settings can override it (persisted). */
export const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';

interface Extra {
  googleMapsConfigured?: { android?: boolean; ios?: boolean };
  usesCleartextTraffic?: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Whether a native Google Maps key was configured when this build was made. */
export const googleMapsConfigured: boolean =
  Platform.OS === 'ios' ? !!extra.googleMapsConfigured?.ios : !!extra.googleMapsConfigured?.android;

export const appVersion: string = Constants.expoConfig?.version ?? '0.0.0';

/** Milliseconds to wait for the map's onMapReady before showing the fallback. */
export const MAP_READY_TIMEOUT_MS = 8000;
