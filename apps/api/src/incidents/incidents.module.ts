import { Module } from '@nestjs/common';
import { OperatorGuard } from '../common/operator.guard';
import { LiveModule } from '../live/live.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { OperatorController } from './operator.controller';
import { HistoryController } from './history.controller';

@Module({
  imports: [ScenariosModule, LiveModule],
  controllers: [IncidentsController, OperatorController, HistoryController],
  providers: [IncidentsService, OperatorGuard],
  exports: [IncidentsService, OperatorGuard],
})
export class IncidentsModule {}
