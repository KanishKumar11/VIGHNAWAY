import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  type HospitalStatesResponse,
  type HospitalStateValue,
  HospitalStateSchema,
  type Scenario,
} from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { places, scenarios } from '../db/schema';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimClockService } from '../scenarios/sim-clock.service';

type StoredStates = Record<string, { state: HospitalStateValue; setAtS: number }>;

/** Operator-set hospital states (P2-4.a). They only rank which hospital a trip is assigned to. */
@Injectable()
export class HospitalsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
  ) {}

  private stored(raw: unknown): StoredStates {
    const out: StoredStates = {};
    if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw as Record<string, { state?: unknown; setAtS?: unknown }>)) {
        const state = HospitalStateSchema.safeParse(v?.state);
        if (state.success && typeof v.setAtS === 'number') out[id] = { state: state.data, setAtS: v.setAtS };
      }
    }
    return out;
  }

  async list(scenarioId: string): Promise<HospitalStatesResponse> {
    const row = await this.scenarios.requireRow(scenarioId);
    return this.respond(scenarioId, row.definition as Scenario, this.stored(row.hospitalStates));
  }

  private async respond(scenarioId: string, def: Scenario, states: StoredStates): Promise<HospitalStatesResponse> {
    const hospitals = await this.db.select().from(places).where(eq(places.scenarioId, scenarioId));
    return {
      scenarioId,
      simulated: def.simulated,
      hospitals: hospitals
        .filter((p) => p.kind === 'hospital')
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((p) => {
          const s = states[p.id];
          return { placeId: p.id, name: p.name, state: s?.state ?? 'accepting', setAtS: s?.setAtS ?? null, setBy: s ? ('operator' as const) : null };
        }),
    };
  }

  async set(scenarioId: string, placeId: string, state: HospitalStateValue): Promise<HospitalStatesResponse> {
    const nowS = await this.clock.nowS(scenarioId);
    const { row, states } = await this.db.transaction(async (tx) => {
      const locked = await this.scenarios.lock(tx, scenarioId);
      const [place] = await tx.select().from(places).where(eq(places.id, placeId)).limit(1);
      if (!place || place.scenarioId !== scenarioId || place.kind !== 'hospital') {
        throw new ApiException('NOT_FOUND', `Unknown hospital ${placeId}`);
      }
      const next = this.stored(locked.hospitalStates);
      // "accepting" is the default, so setting it back removes the entry.
      if (state === 'accepting') delete next[placeId];
      else next[placeId] = { state, setAtS: nowS };
      await tx.update(scenarios).set({ hospitalStates: next }).where(eq(scenarios.id, scenarioId));
      return { row: locked, states: next };
    });
    return this.respond(scenarioId, row.definition as Scenario, states);
  }
}
