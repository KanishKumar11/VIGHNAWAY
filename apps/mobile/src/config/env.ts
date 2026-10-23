import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Default API base URL; Settings can override it (persisted). */
export const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';

/** Public address of the control-room console, used for decision-receipt links (EXPO_PUBLIC_CONSOLE_URL). Optional. */
export const CONSOLE_URL = (process.env.EXPO_PUBLIC_CONSOLE_URL ?? '').trim().replace(/\/+$/, '');

interface Extra {
  googleMapsConfigured?: { android?: boolean; ios?: boolean };
  usesCleartextTraffic?: boolean;
  buildTime?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Whether a native Google Maps key was configured when this build was made. */
export const googleMapsConfigured: boolean =
  Platform.OS === 'ios' ? !!extra.googleMapsConfigured?.ios : !!extra.googleMapsConfigured?.android;


/**
 * Live place search (typing "Ambala" lists real places with addresses). A Photon server: free search
 * over OpenStreetMap data, no key. EXPO_PUBLIC_GEOCODER_URL changes the host; "off" turns it off and
 * leaves only the built-in places. The text typed and a rough area (about 10 km) are sent to it.
 */
const geocoder = (process.env.EXPO_PUBLIC_GEOCODER_URL ?? '').trim().replace(/\/+$/, '');
export const GEOCODER_URL: string = geocoder.toLowerCase() === 'off' ? '' : geocoder || 'https://photon.komoot.io';

export const appVersion: string = Constants.expoConfig?.version ?? '0.0.0';

/** When this build was made, or null if the build did not record it. */
export const buildTime: Date | null = extra.buildTime && !Number.isNaN(Date.parse(extra.buildTime)) ? new Date(extra.buildTime) : null;

/** Milliseconds to wait for the map's onMapReady before showing the fallback. */
export const MAP_READY_TIMEOUT_MS = 8000;
