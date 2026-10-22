import { Module } from '@nestjs/common';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { SimClockService } from './sim-clock.service';

@Module({
  controllers: [ScenariosController],
  providers: [ScenariosService, SimClockService],
  exports: [ScenariosService, SimClockService],
})
export class ScenariosModule {}
