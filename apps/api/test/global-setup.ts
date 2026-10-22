import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrations';
import { seedAll } from '../src/db/seed-data';
import { TEST_DATABASE_URL } from './env';

/** Fresh schema in vighnaway_test: drop our tables, migrate from scratch, seed twice (idempotent). */
export default async function setup(): Promise<void> {
  if (!/_test\b/.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(`refusing to reset a non-test database: ${TEST_DATABASE_URL}`);
  }
  const h = createDb(TEST_DATABASE_URL, { max: 1 });
  try {
    await h.sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    for (const t of ['incident_events', 'incident_reports', 'incidents', 'sim_runs', 'scenarios', 'places', 'road_edges']) {
      await h.sql.unsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    await runMigrations(h.db);
    await seedAll(h.db);
    await seedAll(h.db);
  } finally {
    await h.close();
  }
}
