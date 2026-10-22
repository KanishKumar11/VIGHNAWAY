import type { Incident } from './incidents';
import { FEED_PROVIDER_LABEL, INCIDENT_SOURCE_LABEL, INCIDENT_STATUS_LABEL } from './incidents';

/**
 * Formatting helpers shared by every surface so the phone, console and report page say the same
 * thing. Screen copy lives in each app's i18n file; these are only the value formatters.
 */

/** Words no surface may show (BUILD_PROMPT section 1). Tests scan copy files against this list. */
export const FORBIDDEN_WORDS = ['safe', 'safest', 'guaranteed', 'safety'] as const;

/**
 * Phrases the spec mandates verbatim even though they contain a forbidden word. They describe the
 * driver's judgement, never a property of a route.
 */
export const ALLOWED_PHRASES = ['Turn back only where it is safe to do so'] as const;

/** Returns the forbidden words found in `text` (whole words, case-insensitive). */
export function findForbiddenWords(text: string): string[] {
  let t = text;
  for (const p of ALLOWED_PHRASES) t = t.split(p).join('');
  const found: string[] = [];
  for (const w of FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(t)) found.push(w);
  }
  if (/\d+\s*%\s*(safe|safety)/i.test(t)) found.push('safety percentage');
  return found;
}

/** "14:12" for a simulation time, given the scenario's clockStartsAt (ISO with offset). */
export function formatSimClock(clockStartsAt: string, simTimeS: number, withSeconds = false): string {
  const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(clockStartsAt);
  const startS = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : 0;
  const t = (((startS + Math.floor(simTimeS)) % 86400) + 86400) % 86400;
  const hh = String(Math.floor(t / 3600)).padStart(2, '0');
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/** "Just now", "12 min", "2 h 5 min". */
export function formatAge(ageS: number): string {
  const s = Math.max(0, Math.floor(ageS));
  if (s < 60) return 'Just now';
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

/** Whole minutes, rounded up, for ETAs: "14 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

/** Signed minutes for trade-offs: "+6 min", "−2 min", "same time". */
export function formatDelta(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min === 0) return 'about the same time';
  return min > 0 ? `+${min} min` : `−${Math.abs(min)} min`;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Evidence label: "Corroborated (2 devices)", "Verified by operator (simulated)", ... */
export function statusLabel(
  i: Pick<Incident, 'status' | 'deviceCount' | 'verifiedBy'> & Partial<Pick<Incident, 'source' | 'feed'>>,
): string {
  if (i.status === 'corroborated' && i.source === 'live_feed') {
    return `Reported by ${i.feed ? FEED_PROVIDER_LABEL[i.feed.provider] : 'a'} live traffic${i.deviceCount > 0 ? ` and ${i.deviceCount} device${i.deviceCount === 1 ? '' : 's'}` : ''}`;
  }
  if (i.status === 'corroborated') return `Corroborated (${i.deviceCount} devices)`;
  if (i.status === 'verified') {
    return i.verifiedBy === 'simulated_operator'
      ? 'Verified by operator (simulated)'
      : 'Verified by operator';
  }
  return INCIDENT_STATUS_LABEL[i.status];
}

export function sourceLabel(i: Pick<Incident, 'source'> & Partial<Pick<Incident, 'feed'>>): string {
  if (i.source === 'live_feed' && i.feed) return `${FEED_PROVIDER_LABEL[i.feed.provider]} live traffic`;
  return INCIDENT_SOURCE_LABEL[i.source];
}
