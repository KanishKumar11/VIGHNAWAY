import { Module } from '@nestjs/common';
import { OperatorGuard } from '../common/operator.guard';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';

@Module({
  imports: [ScenariosModule],
  controllers: [HospitalsController],
  providers: [HospitalsService, OperatorGuard],
})
export class HospitalsModule {}
