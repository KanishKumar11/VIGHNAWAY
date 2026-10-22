import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { Scenario, ScenarioSummary } from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import type { Db, DbOrTx, Tx } from '../db/client';
import { DB } from '../db/db.module';
import { type ScenarioRow, scenarios } from '../db/schema';

@Injectable()
export class ScenariosService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(): Promise<ScenarioSummary[]> {
    const rows = await this.db.select().from(scenarios).orderBy(asc(scenarios.id));
    return rows.map((r) => {
      const d = r.definition as Scenario;
      return { id: r.id, name: d.name, area: d.area, mode: d.mode ?? 'simulated', simulated: d.simulated, graphVersion: r.graphVersion };
    });
  }

  async getRow(id: string, q: DbOrTx = this.db): Promise<ScenarioRow | null> {
    const [row] = await q.select().from(scenarios).where(eq(scenarios.id, id)).limit(1);
    return row ?? null;
  }

  async requireRow(id: string, q: DbOrTx = this.db): Promise<ScenarioRow> {
    const row = await this.getRow(id, q);
    if (!row) throw new ApiException('NOT_FOUND', `Unknown scenario ${id}`);
    return row;
  }

  definition(row: ScenarioRow): Scenario {
    return row.definition as Scenario;
  }

  /**
   * Locks the scenario row for the rest of the transaction. Every incident writer takes this
   * lock first, so seq values are handed out (and incidents changed) strictly one at a time.
   */
  async lock(tx: Tx, id: string): Promise<ScenarioRow> {
    const [row] = await tx.select().from(scenarios).where(eq(scenarios.id, id)).for('update');
    if (!row) throw new ApiException('NOT_FOUND', `Unknown scenario ${id}`);
    return row;
  }

  /** Next per-scenario sequence number (call with the row locked). */
  async nextSeq(tx: Tx, id: string): Promise<number> {
    const [row] = await tx
      .update(scenarios)
      .set({ seq: sql`${scenarios.seq} + 1` })
      .where(eq(scenarios.id, id))
      .returning({ seq: scenarios.seq });
    return row!.seq;
  }
}
