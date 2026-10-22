/**
 * Localised versions of the shared formatters (contracts' formatDuration, formatAge, formatDelta,
 * formatDistance). English output is identical to the shared helpers, so English copy and tests
 * are unchanged; Hindi and Marathi use their own unit words. Digits stay Latin (as on Mumbai's
 * road signs and in the scenario data).
 */
import { t } from './en';

/** "16 min", "1 h 5 min": whole minutes rounded up (same rule as formatDuration). */
export function fmtDuration(seconds: number): string {
  const min = Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
  if (min < 60) return t('fmtMin', { n: min });
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? t('fmtHour', { h }) : t('fmtHourMin', { h, m: rem });
}

/** "Just now", "12 min", "2 h 5 min" (same rule as formatAge). */
export function fmtAge(ageS: number): string {
  const s = Math.max(0, Math.floor(ageS));
  if (s < 60) return t('fmtJustNow');
  const min = Math.floor(s / 60);
  if (min < 60) return t('fmtMin', { n: min });
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? t('fmtHour', { h }) : t('fmtHourMin', { h, m: rem });
}

/** "+6 min", "−2 min", "about the same time" (same rule as formatDelta). */
export function fmtDelta(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min === 0) return t('fmtSame');
  return min > 0 ? t('fmtAdds', { n: min }) : t('fmtSaves', { n: Math.abs(min) });
}

/** "650 m", "6.8 km" (same rule as formatDistance). */
export function fmtDistance(m: number): string {
  if (m < 1000) return t('fmtMeters', { n: Math.round(m / 10) * 10 });
  return t('fmtKm', { n: (m / 1000).toFixed(1) });
}
