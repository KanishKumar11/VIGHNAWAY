import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { ScenarioListResponse, ScenarioResponse } from '@vighnaway/contracts';
import { parseIdOr404 } from '../common/validation';
import { ScenariosService } from './scenarios.service';
import { SimClockService } from './sim-clock.service';

@Controller('scenarios')
export class ScenariosController {
  constructor(
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
  ) {}

  @Get()
  async list(): Promise<ScenarioListResponse> {
    return { scenarios: await this.scenarios.list() };
  }

  @Get(':id')
  async get(@Param('id') rawId: string): Promise<ScenarioResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const row = await this.scenarios.requireRow(id);
    return { scenario: this.scenarios.definition(row), sim: await this.clock.state(id) };
  }
}
