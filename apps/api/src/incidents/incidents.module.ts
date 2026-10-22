import { Module } from '@nestjs/common';
import { OperatorGuard } from '../common/operator.guard';
import { LiveModule } from '../live/live.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AudienceController } from './audience.controller';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { OperatorController } from './operator.controller';
import { HistoryController } from './history.controller';

@Module({
  imports: [ScenariosModule, LiveModule],
  controllers: [IncidentsController, OperatorController, HistoryController, AudienceController],
  providers: [IncidentsService, OperatorGuard],
  exports: [IncidentsService, OperatorGuard],
})
export class IncidentsModule {}
