import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { TrafficController } from './traffic.controller';
import { TrafficFeedService } from './traffic-feed.service';

@Module({
  imports: [ScenariosModule, IncidentsModule],
  controllers: [TrafficController],
  providers: [TrafficFeedService],
  exports: [TrafficFeedService],
})
export class TrafficModule {}
