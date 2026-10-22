import { z } from 'zod';
import { ReportInputSchema, type ReportInput } from './reports';
import { IdSchema } from './primitives';

/**
 * Offline QR relay (P2-2). A phone with no network shows a pending report as a QR code; any device with a
 * network scans it and relays it through the ordinary POST /scenarios/:id/reports. The text is the prefix
 * "VW1:" and compact JSON, signed by nobody: the server treats it exactly like a report from the original
 * device (same device id, same rate limits), keeps its own received time, and stores a repeated
 * clientReportId once. A relayer adds no weight to the report.
 */
export const RELAY_PREFIX = 'VW1:';
export const RELAY_SCHEMA_VERSION = 1;
/** A QR code at error-correction level M holds this many bytes at most (version 40); payloads are far smaller. */
export const RELAY_MAX_CHARS = 2000;

export const RelayPayloadSchema = z
  .object({
    v: z.literal(RELAY_SCHEMA_VERSION),
    /** Scenario the report was made in: it is only ever relayed there. */
    s: IdSchema,
    r: ReportInputSchema.refine((r) => !!r.clientReportId, { path: ['clientReportId'], message: 'A relayed report needs its clientReportId' }),
  })
  .strict();
export type RelayPayload = z.infer<typeof RelayPayloadSchema>;

export function encodeRelay(scenarioId: string, report: ReportInput): string {
  const payload: RelayPayload = { v: RELAY_SCHEMA_VERSION, s: scenarioId, r: report };
  RelayPayloadSchema.parse(payload);
  return RELAY_PREFIX + JSON.stringify(payload);
}

export type RelayDecoded = { ok: true; payload: RelayPayload } | { ok: false; reason: 'not_vighnaway' | 'too_long' | 'bad_json' | 'bad_payload' };

/** Reads text scanned from a QR code. Anything that is not a VIGHNAWAY relay code is refused without parsing it further. */
export function decodeRelay(text: string): RelayDecoded {
  if (!text.startsWith(RELAY_PREFIX)) return { ok: false, reason: 'not_vighnaway' };
  if (text.length > RELAY_MAX_CHARS) return { ok: false, reason: 'too_long' };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(RELAY_PREFIX.length));
  } catch {
    return { ok: false, reason: 'bad_json' };
  }
  const parsed = RelayPayloadSchema.safeParse(json);
  return parsed.success ? { ok: true, payload: parsed.data } : { ok: false, reason: 'bad_payload' };
}
