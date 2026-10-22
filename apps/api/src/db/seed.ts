/** `pnpm --filter api db:seed`: idempotent seed from @vighnaway/scenario-data. */
import { loadConfig } from '../config';
import { createDb } from './client';
import { seedAll } from './seed-data';

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl, { max: 1 });
  try {
    const result = await seedAll(handle.db, (line) => console.log(line));
    for (const r of result) {
      console.log(`seeded ${r.scenarioId}: ${r.edges} road edges (graph ${r.graphVersion}), ${r.places} places`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
