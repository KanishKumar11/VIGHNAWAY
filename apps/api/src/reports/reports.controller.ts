import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ReportInputSchema, ReportPhotoInputSchema, type ReportPhotoResponse, type ReportResponse } from '@vighnaway/contracts';
import type { Request } from 'express';
import { type AuthedRequest, optionalAuth } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { parseIdOr404, parseOr400 } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { PhotosService } from './photos.service';
import { ReportsService } from './reports.service';

@Controller('scenarios/:id/reports')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PhotosService) private readonly photos: PhotosService,
  ) {}

  /** Throttled per IP and per device (see ReportsModule). Server assigns the time. */
  @Post()
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async create(@Param('id') rawId: string, @Body() body: unknown, @Req() req: Request): Promise<ReportResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const input = parseOr400(ReportInputSchema, body);
    await this.scenarios.requireRow(id);
    // Signing in is optional: an anonymous report, or a stale or unknown token, is still accepted.
    const who = await optionalAuth(this.auth, req as AuthedRequest);
    return this.reports.submit(id, input, { source: 'user_report', ip: req.ip ?? null, userId: who?.user.id ?? null });
  }

  /**
   * A photo of the place, sent after the report so an API (or app) without photos still works. Only
   * the device that sent the report can attach one. Same throttling as the report; the body limit for
   * this route alone is raised in app.factory.ts.
   */
  @Post(':reportId/photo')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  async photo(@Param('id') rawId: string, @Param('reportId') rawReportId: string, @Body() body: unknown): Promise<ReportPhotoResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const reportId = parseIdOr404(rawReportId, 'report');
    const input = parseOr400(ReportPhotoInputSchema, body);
    await this.scenarios.requireRow(id);
    return this.photos.attach(id, reportId, input);
  }
}
