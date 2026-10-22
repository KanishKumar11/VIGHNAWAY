import { Module } from '@nestjs/common';
import { OperatorGuard } from '../common/operator.guard';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AlertFeedService } from './alert-feed.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [ScenariosModule],
  controllers: [AlertsController],
  providers: [AlertFeedService, OperatorGuard],
  exports: [AlertFeedService],
})
export class AlertsModule {}
