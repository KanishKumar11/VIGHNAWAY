import { z } from 'zod';
import {
  CongestionLevelSchema,
  DepthSchema,
  IncidentSchema,
  ReportTypeSchema,
  SeveritySchema,
} from './incidents';
import { IdSchema, LatLngSchema, SimSecondsSchema } from './primitives';

export const REPORT_DESCRIPTION_MAX = 200;

/**
 * Where a report came from, so each kind can be listed and limited on its own:
 * app (the phone), web (the public report page), audience (a demo-audience phone scanning the
 * presenter QR code) and prompt (an answer to "Is <road> flooded right now?" at a data gap).
 * Optional: a report without one is treated as app. Never evidence: it only labels and limits.
 */
export const REPORT_ORIGINS = ['app', 'web', 'audience', 'prompt'] as const;
export const ReportOriginSchema = z.enum(REPORT_ORIGINS);
export type ReportOrigin = z.infer<typeof ReportOriginSchema>;

/**
 * Body of POST /scenarios/:id/reports. Validated identically on the phone, the report page and
 * the API. Clients never send timestamps: the server assigns every time from the simulation clock.
 */
export const ReportInputSchema = z
  .object({
    type: ReportTypeSchema,
    depth: DepthSchema.nullable().optional(),
    congestion: CongestionLevelSchema.nullable().optional(),
    severity: SeveritySchema.nullable().optional(),
    impassable: z.boolean().optional(),
    point: LatLngSchema,
    observedPersonally: z.boolean(),
    origin: ReportOriginSchema.optional(),
    description: z.string().trim().max(REPORT_DESCRIPTION_MAX).optional(),
    /** Random id kept on the device. Not authoritative evidence; hashed server-side. */
    deviceId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.type !== 'flood' && r.depth != null) {
      ctx.addIssue({ code: 'custom', path: ['depth'], message: 'Depth applies to flood reports only' });
    }
    if (r.type !== 'congestion' && r.congestion != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['congestion'],
        message: 'Congestion level applies to congestion reports only',
      });
    }
    if (r.type === 'congestion' && r.congestion == null) {
      ctx.addIssue({ code: 'custom', path: ['congestion'], message: 'Choose a congestion level' });
    }
    if (r.type !== 'debris' && r.type !== 'accident' && r.severity != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['severity'],
        message: 'Severity applies to debris and accident reports only',
      });
    }
  });
export type ReportInput = z.infer<typeof ReportInputSchema>;

export const ReportOutcomeSchema = z.enum([
  'created_incident',
  'attached',
  'updated_duplicate',
  'corroborated',
  'marked_conflicting',
  'resolved_by_clear_reports',
  'clear_noted',
  'linked_new_incident',
]);
export type ReportOutcome = z.infer<typeof ReportOutcomeSchema>;

export const ReportReceiptSchema = z.object({
  reportId: IdSchema,
  scenarioId: IdSchema,
  outcome: ReportOutcomeSchema,
  receivedAtS: SimSecondsSchema,
  snappedEdgeId: z.string(),
  roadName: z.string().nullable(),
  distanceToRoadM: z.number().nonnegative(),
});
export type ReportReceipt = z.infer<typeof ReportReceiptSchema>;

export const ReportResponseSchema = z.object({
  receipt: ReportReceiptSchema,
  incident: IncidentSchema.nullable(),
});
export type ReportResponse = z.infer<typeof ReportResponseSchema>;
