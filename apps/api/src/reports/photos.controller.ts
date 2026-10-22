import { Controller, Get, Inject, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { PhotoListResponse } from '@vighnaway/contracts';
import type { Response } from 'express';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404 } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { PhotosService } from './photos.service';

/** Operator-only reads: photos are never public (they can show faces or number plates). */
@Controller('scenarios/:id')
@UseGuards(OperatorGuard)
export class PhotosController {
  constructor(
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
  ) {}

  @Get('photos')
  async list(@Param('id') rawId: string): Promise<PhotoListResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    await this.scenarios.requireRow(id);
    return this.photos.list(id);
  }

  @Get('reports/:reportId/photo')
  async image(@Param('id') rawId: string, @Param('reportId') rawReportId: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const id = parseIdOr404(rawId, 'scenario');
    const reportId = parseIdOr404(rawReportId, 'report');
    const { contentType, bytes } = await this.photos.get(id, reportId);
    // Private and never cached: an operator's browser must not keep a citizen's photo.
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(bytes, { type: contentType, disposition: 'inline' });
  }
}
