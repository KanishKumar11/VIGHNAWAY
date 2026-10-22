import { type DynamicModule, Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { LiveModule } from './live/live.module';
import { ReportsModule } from './reports/reports.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SimModule } from './sim/sim.module';
import { TrafficModule } from './traffic/traffic.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            // Never log bodies (device ids, descriptions) or credentials.
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              req: (req: IncomingMessage & { id?: unknown }) => ({ id: req.id, method: req.method, url: req.url }),
              res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
            },
            autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
          },
        }),
        DbModule,
        AuthModule,
        ScenariosModule,
        LiveModule,
        IncidentsModule,
        ReportsModule,
        SimModule,
        TrafficModule,
        HealthModule,
      ],
    };
  }
}
