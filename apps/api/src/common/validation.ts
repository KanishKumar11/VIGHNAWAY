import type { z } from 'zod';
import { IdSchema } from '@vighnaway/contracts';
import { ApiException } from './errors';

/** Parses `value` with a contracts schema or throws 400 VALIDATION_FAILED with the Zod issues. */
export function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'The request is not valid',
      r.error.issues.map((i) => ({ path: i.path.map(String), code: i.code, message: i.message })),
    );
  }
  return r.data;
}

/** Path ids that fail the id pattern can never exist, so they are 404 rather than 400. */
export function parseIdOr404(value: unknown, what: string): string {
  const r = IdSchema.safeParse(value);
  if (!r.success) throw new ApiException('NOT_FOUND', `Unknown ${what}`);
  return r.data;
}

/** Empty bodies (no Content-Type) arrive as undefined or {}; treat both as {}. */
export const bodyOrEmpty = (body: unknown): unknown =>
  body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)
    ? {}
    : body;

/** Plain text: strip control characters (keeps the text, never markup interpretation). */
export const plainText = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return t.length ? t : null;
};
