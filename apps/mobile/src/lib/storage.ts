import { createMMKV, type MMKV } from 'react-native-mmkv';

/**
 * Small JSON wrapper around MMKV. If the native module is missing (it never should be in a dev
 * build), it falls back to memory so the app keeps working without persistence.
 */
let mmkv: MMKV | null | undefined;
const memory = new Map<string, string>();

function instance(): MMKV | null {
  if (mmkv === undefined) {
    try {
      mmkv = createMMKV({ id: 'vighnaway' });
    } catch (e) {
      console.warn('MMKV unavailable, using memory storage', e);
      mmkv = null;
    }
  }
  return mmkv;
}

export const KEYS = {
  settings: 'settings.v1',
  incidents: 'incidents.v1',
  sim: 'sim.v1',
  scenario: 'scenario.v1',
  lastPlan: 'lastPlan.v1',
  activity: 'activity.v1',
  pendingReports: 'pendingReports.v1',
  deviceId: 'deviceId.v1',
  asked: 'asked.v1',
  auth: 'auth.v1',
} as const;

export const storage = {
  getString(key: string): string | undefined {
    const s = instance();
    return s ? s.getString(key) : memory.get(key);
  },
  setString(key: string, value: string): void {
    const s = instance();
    if (s) s.set(key, value);
    else memory.set(key, value);
  },
  getJSON<T>(key: string): T | undefined {
    const raw = storage.getString(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setJSON(key: string, value: unknown): void {
    storage.setString(key, JSON.stringify(value));
  },
  remove(key: string): void {
    const s = instance();
    if (s) s.remove(key);
    else memory.delete(key);
  },
};
