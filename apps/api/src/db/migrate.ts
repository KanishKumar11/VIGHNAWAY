/** `pnpm --filter api db:migrate`: applies apps/api/drizzle to DATABASE_URL. */
import { loadConfig } from '../config';
import { createDb } from './client';
import { runMigrations } from './migrations';

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl, { max: 1 });
  try {
    await runMigrations(handle.db);
    console.log('migrations applied');
  } finally {
    await handle.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
