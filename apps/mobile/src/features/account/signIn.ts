import { t } from '@/i18n/en';
import { ApiRequestError } from '@/lib/api';

/** How a sign-in failure is shown: staff and disabled accounts are explained, not reported as errors. */
export interface Notice {
  text: string;
  tone: 'danger' | 'warn';
}

/** Whole minutes the code lives, never below one. */
export const minutesFor = (expiresInS: number): number => Math.max(1, Math.round(expiresInS / 60));

/** A failed "Send code" (a 429 with retryAfterS is handled by the screen as a countdown). */
export function requestNotice(e: unknown, apiUrl: string): Notice {
  if (e instanceof ApiRequestError) {
    if (e.status === 0) return { text: t('accountNetworkError', { url: apiUrl }), tone: 'danger' };
    if (e.status === 429 || e.code === 'RATE_LIMITED') return { text: t('accountTooMany'), tone: 'warn' };
    // The route is missing: the API is an older build than the app.
    if (e.status === 404) return { text: t('accountServerOutdated'), tone: 'danger' };
    if (e.status === 400 || e.code === 'VALIDATION_FAILED') return { text: t('accountEmailInvalid'), tone: 'danger' };
    return { text: t('accountGenericError', { message: e.message }), tone: 'danger' };
  }
  return { text: t('accountGenericError', { message: 'unexpected response' }), tone: 'danger' };
}

/**
 * A failed "Sign in". Every bad, expired, used or locked code is the same 401, so the wording
 * never says which. A 403 is either a staff account (the phone app is for citizens) or a
 * disabled one; each gets its own explanation.
 */
export function verifyNotice(e: unknown, apiUrl: string): Notice {
  if (e instanceof ApiRequestError) {
    if (e.status === 0) return { text: t('accountNetworkError', { url: apiUrl }), tone: 'danger' };
    if (e.status === 401) return { text: t('accountCodeInvalid'), tone: 'danger' };
    // The route is missing: the API is an older build than the app.
    if (e.status === 404) return { text: t('accountServerOutdated'), tone: 'danger' };
    if (e.status === 403 || e.code === 'FORBIDDEN') {
      if (/staff|web console/i.test(e.message)) return { text: t('accountStaff'), tone: 'warn' };
      if (/disabled/i.test(e.message)) return { text: t('accountDisabled'), tone: 'warn' };
      return { text: t('accountForbidden'), tone: 'warn' };
    }
    if (e.status === 400 || e.code === 'VALIDATION_FAILED') return { text: t('accountCodeFormat'), tone: 'danger' };
    if (e.status === 429 || e.code === 'RATE_LIMITED') return { text: t('accountTooMany'), tone: 'warn' };
    return { text: t('accountGenericError', { message: e.message }), tone: 'danger' };
  }
  return { text: t('accountGenericError', { message: 'unexpected response' }), tone: 'danger' };
}

/** The thank-you lines for GET /me/stats. Counts only: no score, rank, points or level. */
export function statsLines(stats: { reports: number; inVerifiedIncidents: number }): string[] {
  if (stats.reports <= 0) return [t('accountStatsNone')];
  const lines = [stats.reports === 1 ? t('accountStatsOne') : t('accountStatsMany', { n: stats.reports })];
  if (stats.inVerifiedIncidents > 0) {
    lines.push(stats.inVerifiedIncidents === 1 ? t('accountVerifiedOne') : t('accountVerifiedMany', { n: stats.inVerifiedIncidents }));
  }
  return lines;
}
