import { z } from 'zod';
import {
  CongestionLevelSchema,
  DepthSchema,
  IncidentSchema,
  ReportTypeSchema,
  SeveritySchema,
  WalkingConcernSchema,
} from './incidents';
import { IdSchema, LatLngSchema, SimSecondsSchema } from './primitives';

export const REPORT_DESCRIPTION_MAX = 200;

/** How far back a device may say it saw something (P2-2, offline relay): the last 2 simulated hours. */
export const OBSERVED_AT_MAX_AGE_S = 7200;

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
    /** Walking concern reports only (P2-8): what is wrong with the road. */
    concern: WalkingConcernSchema.optional(),
    impassable: z.boolean().optional(),
    point: LatLngSchema,
    observedPersonally: z.boolean(),
    origin: ReportOriginSchema.optional(),
    /**
     * Made on the device (a UUID) when the report is written, so the same report relayed twice, or once by
     * the phone and once by someone who scanned its QR code, is stored once (P2-2). Not evidence.
     */
    clientReportId: z.string().uuid().optional(),
    /**
     * The device's claim of when it saw this (simulation seconds), within the last 2 hours and not in the
     * future. A label only: the server assigns the received time and uses that for ordering and age.
     */
    observedAtS: SimSecondsSchema.optional(),
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
    // Walking concerns (P2-8) describe a road and a condition and nothing else: no note a report could use to name a
    // person or a place, and none of the hazard fields.
    if (r.type === 'walking_concern') {
      if (!r.concern) ctx.addIssue({ code: 'custom', path: ['concern'], message: 'Choose what is wrong with the road' });
      for (const field of ['description', 'severity', 'depth', 'congestion'] as const) {
        if (r[field] != null && r[field] !== '') {
          ctx.addIssue({ code: 'custom', path: [field], message: 'A walking concern report has no ' + field });
        }
      }
      if (r.impassable) ctx.addIssue({ code: 'custom', path: ['impassable'], message: 'A walking concern never closes a road' });
    } else if (r.concern != null) {
      ctx.addIssue({ code: 'custom', path: ['concern'], message: 'Concern applies to walking concern reports only' });
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
  /** Live mode only: saved, but no mapped road within snap range, so it creates no incident and changes no route. */
  'off_map',
]);
export type ReportOutcome = z.infer<typeof ReportOutcomeSchema>;

export const ReportReceiptSchema = z.object({
  reportId: IdSchema,
  scenarioId: IdSchema,
  outcome: ReportOutcomeSchema,
  receivedAtS: SimSecondsSchema,
  /** null for an 'off_map' report. */
  snappedEdgeId: z.string().nullable(),
  roadName: z.string().nullable(),
  distanceToRoadM: z.number().nonnegative().nullable(),
});
export type ReportReceipt = z.infer<typeof ReportReceiptSchema>;

export const ReportResponseSchema = z.object({
  receipt: ReportReceiptSchema,
  incident: IncidentSchema.nullable(),
});
export type ReportResponse = z.infer<typeof ReportResponseSchema>;

/**
 * A photo of the place, sent after the report as its own request (so an API that does not know
 * photos still accepts the report). The phone re-encodes it as a small JPEG, which also drops its
 * EXIF data (no location or device metadata). Only operators can see photos.
 */
export const PHOTO_MAX_BYTES = 350_000;
/** Base64 grows the bytes by 4/3. */
const PHOTO_MAX_BASE64 = Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 4;
/** Request body limit for the photo route (the JSON envelope adds a little to the base64). */
export const PHOTO_BODY_LIMIT_BYTES = PHOTO_MAX_BASE64 + 1024;

export const ReportPhotoInputSchema = z
  .object({
    /** The same device id the report was sent with: only that device can attach a photo to it. */
    deviceId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    contentType: z.literal('image/jpeg'),
    /** The JPEG bytes, base64 (no data: prefix). */
    data: z
      .string()
      .min(100)
      .max(PHOTO_MAX_BASE64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type ReportPhotoInput = z.infer<typeof ReportPhotoInputSchema>;

export const ReportPhotoResponseSchema = z.object({
  reportId: z.string(),
  sizeBytes: z.number().int().positive(),
});
export type ReportPhotoResponse = z.infer<typeof ReportPhotoResponseSchema>;

/** Operator list of the photos in a scenario, newest first. `atS` is the report's server time. */
export const PhotoListResponseSchema = z.object({
  photos: z.array(
    z.object({
      reportId: z.string(),
      incidentId: z.string().nullable(),
      atS: z.number().int().nonnegative(),
      sizeBytes: z.number().int().positive(),
    }),
  ),
});
export type PhotoListResponse = z.infer<typeof PhotoListResponseSchema>;
