import 'reflect-metadata';
import { Logger } from 'nestjs-pino';
import { createApp } from './app.factory';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port, config.host);
  app
    .get(Logger)
    .log(
      `VIGHNAWAY API listening on http://${config.host}:${config.port} (CORS: ${config.corsOrigins.join(', ') || 'none'})`,
      'Bootstrap',
    );
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
