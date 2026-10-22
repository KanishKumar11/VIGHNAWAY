import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config';
import { saltedHash } from '../common/hash';
import { IncidentsModule } from '../incidents/incidents.module';
import { LiveModule } from '../live/live.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

const deviceIdOf = (req: Record<string, unknown>): string | null => {
  const body = req.body as { deviceId?: unknown } | undefined;
  return typeof body?.deviceId === 'string' && body.deviceId.length <= 64 ? body.deviceId : null;
};

@Module({
  imports: [
    ScenariosModule,
    LiveModule,
    IncidentsModule,
    // Two named throttlers on POST /reports: per client IP and per device id (hashed key).
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'ip', ttl: 60_000, limit: config.reportIpLimitPerMin },
          {
            name: 'device',
            ttl: 60_000,
            limit: config.reportDeviceLimitPerMin,
            skipIf: (ctx) => deviceIdOf(ctx.switchToHttp().getRequest()) === null,
            getTracker: (req) => saltedHash(config.deviceHashSalt, `device:${deviceIdOf(req) ?? ''}`),
          },
        ],
        errorMessage: 'Too many reports. Wait a minute and try again',
      }),
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
