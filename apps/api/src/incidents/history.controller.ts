import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { HistoryResponse } from '@vighnaway/contracts';
import { parseIdOr404 } from '../common/validation';
import { IncidentsService } from './incidents.service';

/** Incident history of the current run, for replaying past decisions on the console timeline. */
@Controller('scenarios/:id/history')
export class HistoryController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Get()
  history(@Param('id') rawId: string): Promise<HistoryResponse> {
    return this.incidents.history(parseIdOr404(rawId, 'scenario'));
  }
}
