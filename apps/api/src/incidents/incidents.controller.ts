import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  type IncidentsResponse,
  IncidentsQuerySchema,
  OperatorActionBodySchema,
  OperatorActionSchema,
  type OperatorActionResponse,
} from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import { OperatorGuard } from '../common/operator.guard';
import { bodyOrEmpty, parseIdOr404, parseOr400, plainText } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { IncidentsService } from './incidents.service';

@Controller('scenarios/:id/incidents')
export class IncidentsController {
  constructor(
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
  ) {}

  @Get()
  async list(@Param('id') rawId: string, @Query() query: unknown): Promise<IncidentsResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const q = parseOr400(IncidentsQuerySchema, query);
    return this.incidents.snapshot(id, q.sinceSeq);
  }

  @Post(':incidentId/:action')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async action(
    @Param('id') rawId: string,
    @Param('incidentId') rawIncidentId: string,
    @Param('action') rawAction: string,
    @Body() body: unknown,
  ): Promise<OperatorActionResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const incidentId = parseIdOr404(rawIncidentId, 'incident');
    const action = OperatorActionSchema.safeParse(rawAction);
    if (!action.success) throw new ApiException('NOT_FOUND', `Unknown action ${rawAction}`);
    const input = parseOr400(OperatorActionBodySchema, bodyOrEmpty(body));
    await this.scenarios.requireRow(id);
    return this.incidents.operatorAction(id, incidentId, action.data, {
      actor: 'operator',
      note: plainText(input.note),
    });
  }
}
