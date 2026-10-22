import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { OperatorGuard } from '../common/operator.guard';

/** GET /operator/check: 204 when the Bearer token is right, 401 otherwise. */
@Controller('operator')
export class OperatorController {
  @Get('check')
  @HttpCode(204)
  @UseGuards(OperatorGuard)
  check(): void {
    return undefined;
  }
}
