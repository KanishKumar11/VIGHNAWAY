import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { PHOTO_MAX_BYTES, type PhotoListResponse, type ReportPhotoInput, type ReportPhotoResponse } from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import { constantTimeEqual, saltedHash } from '../common/hash';
import { APP_CONFIG, type AppConfig } from '../config';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { incidentReports, reportPhotos } from '../db/schema';

/** A JPEG starts with FF D8 FF and ends with FF D9. The phone sends a re-encoded JPEG, so this is a sanity check, not a decoder. */
export function looksLikeJpeg(b: Buffer): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}

/**
 * Photos of the place, one per report, attached by the device that sent the report. Operators only:
 * nothing here is public and nothing reads a photo for routing or corroboration.
 */
@Injectable()
export class PhotosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async attach(scenarioId: string, reportId: string, input: ReportPhotoInput): Promise<ReportPhotoResponse> {
    const [report] = await this.db
      .select({ id: incidentReports.id, incidentId: incidentReports.incidentId, deviceHash: incidentReports.deviceHash })
      .from(incidentReports)
      .where(and(eq(incidentReports.id, reportId), eq(incidentReports.scenarioId, scenarioId)))
      .limit(1);
    if (!report) throw new ApiException('NOT_FOUND', 'Unknown report');
    // Only the device that sent the report can add a photo to it (a prototype heuristic, like corroboration).
    if (!constantTimeEqual(report.deviceHash, saltedHash(this.config.deviceHashSalt, input.deviceId))) {
      throw new ApiException('FORBIDDEN', 'Only the device that sent the report can add a photo to it');
    }
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.length > PHOTO_MAX_BYTES) throw new ApiException('PAYLOAD_TOO_LARGE', `A photo can be at most ${Math.round(PHOTO_MAX_BYTES / 1000)} kB`);
    if (!looksLikeJpeg(bytes)) throw new ApiException('VALIDATION_FAILED', 'The photo is not a JPEG');
    const inserted = await this.db
      .insert(reportPhotos)
      .values({ reportId, scenarioId, incidentId: report.incidentId, contentType: input.contentType, bytes, sizeBytes: bytes.length })
      .onConflictDoNothing()
      .returning({ reportId: reportPhotos.reportId });
    if (inserted.length === 0) throw new ApiException('CONFLICT', 'This report already has a photo');
    return { reportId, sizeBytes: bytes.length };
  }

  /** Newest first, with the report's server time for the age label. */
  async list(scenarioId: string, limit = 200): Promise<PhotoListResponse> {
    const rows = await this.db
      .select({
        reportId: reportPhotos.reportId,
        incidentId: reportPhotos.incidentId,
        sizeBytes: reportPhotos.sizeBytes,
        atS: incidentReports.receivedAtS,
      })
      .from(reportPhotos)
      .innerJoin(incidentReports, eq(incidentReports.id, reportPhotos.reportId))
      .where(eq(reportPhotos.scenarioId, scenarioId))
      .orderBy(desc(reportPhotos.createdAt))
      .limit(limit);
    return { photos: rows };
  }

  async get(scenarioId: string, reportId: string): Promise<{ contentType: string; bytes: Buffer }> {
    const [row] = await this.db
      .select({ contentType: reportPhotos.contentType, bytes: reportPhotos.bytes })
      .from(reportPhotos)
      .where(and(eq(reportPhotos.reportId, reportId), eq(reportPhotos.scenarioId, scenarioId)))
      .limit(1);
    if (!row) throw new ApiException('NOT_FOUND', 'No photo for this report');
    return row;
  }
}
