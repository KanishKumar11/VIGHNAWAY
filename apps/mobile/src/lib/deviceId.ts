import * as Crypto from 'expo-crypto';
import { KEYS, storage } from './storage';

/**
 * Random id kept on this phone and sent with reports. It is not authoritative evidence: the
 * server hashes it, and device corroboration is a prototype heuristic.
 */
export function getDeviceId(): string {
  const existing = storage.getString(KEYS.deviceId);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  let uuid: unknown;
  try {
    uuid = Crypto.randomUUID();
  } catch {
    uuid = null;
  }
  // Fallback only if the native module is unavailable; the id is never routing evidence.
  const raw = typeof uuid === 'string' && uuid ? uuid : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const id = `vw-${raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`;
  storage.setString(KEYS.deviceId, id);
  return id;
}
