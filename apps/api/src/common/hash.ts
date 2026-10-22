import { createHash, timingSafeEqual } from 'node:crypto';

/** sha256(salt + value), hex. Device ids and IPs are never stored raw. */
export const saltedHash = (salt: string, value: string): string =>
  createHash('sha256').update(salt + value).digest('hex');

/** Constant-time string comparison (digests first, so lengths never leak). */
export function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db) && a.length === b.length;
}
