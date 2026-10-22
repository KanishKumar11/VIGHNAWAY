import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter, bodyParserErrorHandler } from './common/errors';
import { type AppConfig, BODY_LIMIT, isOriginAllowed } from './config';
import { LiveIoAdapter } from './live/live-io.adapter';

/** Builds the configured Nest application (used by main.ts and the tests). */
export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isOriginAllowed(config, origin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.use(bodyParserErrorHandler);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useWebSocketAdapter(new LiveIoAdapter(app, config));
  app.enableShutdownHooks();
  return app;
}
