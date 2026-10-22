import { Module } from '@nestjs/common';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { LiveGateway } from './live.gateway';
import { LiveService } from './live.service';

@Module({
  imports: [ScenariosModule],
  providers: [LiveService, LiveGateway],
  exports: [LiveService],
})
export class LiveModule {}
