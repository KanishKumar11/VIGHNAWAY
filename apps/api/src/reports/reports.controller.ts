import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ReportInputSchema, type ReportResponse } from '@vighnaway/contracts';
import type { Request } from 'express';
import { type AuthedRequest, optionalAuth } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { parseIdOr404, parseOr400 } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { ReportsService } from './reports.service';

@Controller('scenarios/:id/reports')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(AuthService) private readonly auth: AuthService,
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
}
