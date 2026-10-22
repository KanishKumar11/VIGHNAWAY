import { Body, Controller, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { type HospitalStatesResponse, SetHospitalStateRequestSchema } from '@vighnaway/contracts';
import { OperatorGuard } from '../common/operator.guard';
import { parseIdOr404, parseOr400 } from '../common/validation';
import { HospitalsService } from './hospitals.service';

@Controller('scenarios/:id/hospitals')
export class HospitalsController {
  constructor(@Inject(HospitalsService) private readonly hospitals: HospitalsService) {}

  @Get()
  async list(@Param('id') rawId: string): Promise<HospitalStatesResponse> {
    return this.hospitals.list(parseIdOr404(rawId, 'scenario'));
  }

  /** Operator: set one hospital to accepting, busy or diverting. */
  @Put(':placeId')
  @HttpCode(200)
  @UseGuards(OperatorGuard)
  async set(@Param('id') rawId: string, @Param('placeId') rawPlace: string, @Body() raw: unknown): Promise<HospitalStatesResponse> {
    const id = parseIdOr404(rawId, 'scenario');
    const placeId = parseIdOr404(rawPlace, 'hospital');
    const body = parseOr400(SetHospitalStateRequestSchema, raw);
    return this.hospitals.set(id, placeId, body.state);
  }
}
