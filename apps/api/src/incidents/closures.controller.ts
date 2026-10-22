import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { type ClosureRequest, ClosureRequestSchema, type ClosureResponse } from '@vighnaway/contracts';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404, parseOr400 } from '../common/validation';
import { IncidentsService } from './incidents.service';

/** Operator-drawn closures (P2-6): preview the matched roads, then confirm to create a Verified closure. */
@Controller('scenarios/:id/closures')
export class ClosuresController {
  constructor(@Inject(IncidentsService) private readonly incidents: IncidentsService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async close(@Param('id') rawId: string, @Body() raw: unknown): Promise<ClosureResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const body: ClosureRequest = parseOr400(ClosureRequestSchema, raw);
    return this.incidents.closeRoad(id, body);
  }
}
