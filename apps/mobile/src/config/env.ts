import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Default API base URL; Settings can override it (persisted). */
export const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';

/** Public address of the control-room console, used for decision-receipt links (EXPO_PUBLIC_CONSOLE_URL). Optional. */
export const CONSOLE_URL = (process.env.EXPO_PUBLIC_CONSOLE_URL ?? '').trim().replace(/\/+$/, '');

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
