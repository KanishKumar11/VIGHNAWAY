import { Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { ClearAudienceResponse } from '@vighnaway/contracts';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404 } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { IncidentsService } from './incidents.service';

/** Demo-audience reports (report origin 'audience'): the operator can clear them all in one action. */
@Controller('scenarios/:id/audience')
export class AudienceController {
  constructor(
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
  ) {}

  /** Dismisses every open incident supported only by audience reports. Needs the operator token. */
  @Post('clear')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async clear(@Param('id') rawId: string): Promise<ClearAudienceResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    await this.scenarios.requireRow(id);
    return this.incidents.clearAudience(id);
  }
}
