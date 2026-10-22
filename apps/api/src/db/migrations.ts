import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client';

/** apps/api/drizzle, from both src/db (tsx) and dist/db (built). */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
