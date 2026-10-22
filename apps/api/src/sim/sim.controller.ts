import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { SimActionSchema, type SimResponse } from '@vighnaway/contracts';
import { z } from 'zod';
import { ApiException } from '../common/errors';
import { OperatorGuard } from '../common/operator.guard';
import { bodyOrEmpty, parseIdOr404, parseOr400 } from '../common/validation';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimService } from './sim.service';

const EmptyBodySchema = z.object({}).strict();

@Controller('scenarios/:id/sim')
export class SimController {
  constructor(
    @Inject(SimService) private readonly sim: SimService,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
  ) {}

  @Get()
  async get(@Param('id') rawId: string): Promise<SimResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    await this.scenarios.requireRow(id);
    return { sim: await this.sim.state(id) };
  }

  /** play | pause | step | reset, operator only. */
  @Post(':action')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async action(@Param('id') rawId: string, @Param('action') rawAction: string, @Body() body: unknown): Promise<SimResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const action = SimActionSchema.safeParse(rawAction);
    if (!action.success) throw new ApiException('NOT_FOUND', `Unknown simulation action ${rawAction}`);
    parseOr400(EmptyBodySchema, bodyOrEmpty(body));
    await this.scenarios.requireRow(id);
    const sim = await this.sim[action.data](id);
    return { sim };
  }
}
