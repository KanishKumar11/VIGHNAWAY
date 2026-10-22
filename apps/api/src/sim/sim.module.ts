import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { LiveModule } from '../live/live.module';
import { ReportsModule } from '../reports/reports.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { SimController } from './sim.controller';
import { SimService } from './sim.service';

@Module({
  imports: [ScenariosModule, LiveModule, IncidentsModule, ReportsModule],
  controllers: [SimController],
  providers: [SimService],
  exports: [SimService],
})
export class SimModule {}
