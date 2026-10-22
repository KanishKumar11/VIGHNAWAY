import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { createDb, type Db, type DbHandle } from './client';

export const DB_HANDLE = Symbol('DB_HANDLE');
export const DB = Symbol('DB');

@Injectable()
export class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DbHandle => createDb(config.databaseUrl),
    },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Db => h.db },
    DbLifecycle,
  ],
  exports: [DB, DB_HANDLE],
})
export class DbModule {}
