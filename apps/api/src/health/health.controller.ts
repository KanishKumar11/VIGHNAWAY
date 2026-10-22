import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { HealthResponse } from '@vighnaway/contracts';
import type { Response } from 'express';
import { API_VERSION } from '../config';
import type { DbHandle } from '../db/client';
import { DB_HANDLE } from '../db/db.module';

/**
 * GET /health: database reachable, PostGIS version and the seeded graph version.
 * 200 when all three are present, 503 (same body) otherwise, so container health checks fail.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    let db = false;
    let postgis: string | null = null;
    let graphVersion: string | null = null;
    try {
      await this.handle.sql`SELECT 1`;
      db = true;
      const [v] = await this.handle.sql<{ v: string }[]>`SELECT postgis_lib_version() AS v`;
      postgis = v?.v ?? null;
      const [g] = await this.handle.sql<{ graph_version: string }[]>`
        SELECT s.graph_version FROM scenarios s
        WHERE EXISTS (SELECT 1 FROM road_edges e WHERE e.graph_version = s.graph_version)
        ORDER BY s.id LIMIT 1`;
      graphVersion = g?.graph_version ?? null;
    } catch {
      // Report what we have; the body says which part is missing.
    }
    const ok = db && postgis !== null && graphVersion !== null;
    res.status(ok ? 200 : 503);
    return { ok, db, postgis, graphVersion, version: API_VERSION };
  }
}
