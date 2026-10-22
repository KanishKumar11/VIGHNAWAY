/**
 * Public configuration. Next inlines NEXT_PUBLIC_* at build time, so each is read literally.
 * OPERATOR_TOKEN is never configured here: the operator types it at runtime.
 */
const trimSlash = (s: string) => s.replace(/\/+$/, '');

export const API_URL = trimSlash(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';
const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || '';
const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL || '';

/** QR target: explicit report URL, else the public site URL, else this browser's origin. */
export function reportUrl(origin?: string): string {
  if (REPORT_URL) return REPORT_URL;
  if (PUBLIC_SITE_URL) return `${trimSlash(PUBLIC_SITE_URL)}/report`;
  const o = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${trimSlash(o)}/report`;
}

export const isLocalOnlyUrl = (url: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(url);

/** Link that opens /verify for a decision receipt token. */
export function verifyUrl(token: string, origin?: string): string {
  const base = PUBLIC_SITE_URL ? trimSlash(PUBLIC_SITE_URL) : trimSlash(origin ?? (typeof window !== 'undefined' ? window.location.origin : ''));
  return `${base}/verify?r=${token}`;
}
