import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import {
  type HistoryResponse,
  type Incident,
  type IncidentsResponse,
  isOpenStatus,
  type OperatorAction,
  type OperatorActionResponse,
  type VerifiedBy,
} from '@vighnaway/contracts';
import { ApiException } from '../common/errors';
import type { Db, Tx } from '../db/client';
import { DB } from '../db/db.module';
import { type IncidentRow, incidentEvents, incidents } from '../db/schema';
import { LiveService } from '../live/live.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimClockService } from '../scenarios/sim-clock.service';
import { type ChangeKind, summarize } from './summary';

/** One committed incident change: what incident.upserted carries. */
export interface IncidentChange {
  scenarioId: string;
  seq: number;
  incident: Incident;
  summary: string;
}

/** Incident row without its seq: the change log assigns it. */
export type IncidentDraft = Omit<IncidentRow, 'seq'>;

export function toIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    type: row.type as Incident['type'],
    status: row.status as Incident['status'],
    source: row.source as Incident['source'],
    depth: row.depth as Incident['depth'],
    congestion: row.congestion as Incident['congestion'],
    severity: row.severity as Incident['severity'],
    impassable: row.impassable,
    conflicting: row.conflicting,
    edgeIds: [...row.edgeIds].sort(),
    point: { lat: row.geom[1], lng: row.geom[0] },
    roadName: row.roadName,
    reportCount: row.reportCount,
    deviceCount: row.deviceCount,
    createdAtS: row.createdAtS,
    lastReportAtS: row.lastReportAtS,
    updatedAtS: row.updatedAtS,
    verifiedAtS: row.verifiedAtS,
    verifiedBy: row.verifiedBy as Incident['verifiedBy'],
    closedAtS: row.closedAtS,
    linkedIncidentId: row.linkedIncidentId,
    note: row.note,
    seq: row.seq,
    ...(row.feed ? { feed: row.feed as Incident['feed'] } : {}),
  };
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger('IncidentsService');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
    @Inject(LiveService) private readonly live: LiveService,
  ) {}

  /**
   * GET /scenarios/:id/incidents. `full` when there is no sinceSeq, when it predates the last
   * reset, or when it is ahead of the server (the client's state belongs to another database).
   */
  async snapshot(scenarioId: string, sinceSeq: number | undefined): Promise<IncidentsResponse> {
    const { row, list, full } = await this.db.transaction(
      async (tx) => {
        const row = await this.scenarios.requireRow(scenarioId, tx);
        const full = sinceSeq === undefined || sinceSeq < row.resetSeq || sinceSeq > row.seq;
        const where = full
          ? eq(incidents.scenarioId, scenarioId)
          : and(eq(incidents.scenarioId, scenarioId), gt(incidents.seq, sinceSeq!));
        const list = await tx.select().from(incidents).where(where).orderBy(asc(incidents.id));
        return { row, list, full };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    return {
      scenarioId,
      seq: row.seq,
      full,
      runId: row.runId,
      simTimeS: await this.clock.nowS(scenarioId),
      incidents: list.map(toIncident),
    };
  }

  async findRow(q: Db | Tx, scenarioId: string, id: string): Promise<IncidentRow | null> {
    const [row] = await q
      .select()
      .from(incidents)
      .where(and(eq(incidents.scenarioId, scenarioId), eq(incidents.id, id)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Records one incident change inside the caller's transaction (scenario row already locked):
   * takes the next seq, upserts the incident with it and appends one incident_events row.
   */
  async recordChange(
    tx: Tx,
    draft: IncidentDraft,
    change: {
      kind: ChangeKind;
      actor: string;
      atS: number;
      payload: Record<string, unknown>;
      summaryOpts?: Parameters<typeof summarize>[2];
    },
  ): Promise<IncidentChange> {
    const seq = await this.scenarios.nextSeq(tx, draft.scenarioId);
    const row: IncidentRow = { ...draft, edgeIds: [...draft.edgeIds].sort(), seq };
    const { id: _id, ...rest } = row;
    await tx.insert(incidents).values(row).onConflictDoUpdate({ target: incidents.id, set: rest });
    const incident = toIncident(row);
    const summary = summarize(change.kind, incident, change.summaryOpts);
    await tx.insert(incidentEvents).values({
      scenarioId: draft.scenarioId,
      seq,
      incidentId: draft.id,
      kind: change.kind,
      actor: change.actor,
      atS: change.atS,
      summary,
      // The incident as it is after this change, so history can rebuild any moment (replay).
      payload: { ...change.payload, snapshot: incident },
    });
    return { scenarioId: draft.scenarioId, seq, incident, summary };
  }

  /** Emits incident.upserted for committed changes, in seq order. Call only after commit. */
  publish(changes: readonly IncidentChange[]): void {
    for (const c of [...changes].sort((a, b) => a.seq - b.seq)) {
      this.live.incidentUpserted({
        scenarioId: c.scenarioId,
        seq: c.seq,
        incident: c.incident,
        summary: c.summary,
      });
    }
  }

  /**
   * verify | resolve | dismiss. The same method serves the console (verifiedBy 'operator') and
   * scripted simulation events (verifiedBy 'simulated_operator', time = the event's atS).
   */
  async operatorAction(
    scenarioId: string,
    incidentId: string,
    action: OperatorAction,
    ctx: { nowS?: number; actor: VerifiedBy; note?: string | null; eventId?: string },
  ): Promise<OperatorActionResponse> {
    const nowS = ctx.nowS ?? (await this.clock.nowS(scenarioId));
    const change = await this.db.transaction(async (tx) => {
      await this.scenarios.lock(tx, scenarioId);
      const row = await this.findRow(tx, scenarioId, incidentId);
      if (!row) throw new ApiException('NOT_FOUND', `Unknown incident ${incidentId}`);
      if (!isOpenStatus(row.status as Incident['status'])) {
        throw new ApiException('CONFLICT', `This incident is already ${row.status}`);
      }
      const { seq: _seq, ...draft } = row;
      const next: IncidentDraft = { ...draft, updatedAtS: nowS };
      if (action === 'verify') {
        next.status = 'verified';
        next.verifiedAtS = nowS;
        next.verifiedBy = ctx.actor;
        next.closedAtS = null;
        // An operator confirming the incident settles a Road clear conflict.
        next.conflicting = false;
      } else {
        next.status = action === 'resolve' ? 'resolved' : 'dismissed';
        next.closedAtS = nowS;
      }
      return this.recordChange(tx, next, {
        kind: action === 'verify' ? 'verified' : action === 'resolve' ? 'resolved' : 'dismissed',
        actor: ctx.actor,
        atS: nowS,
        payload: { action, note: ctx.note ?? null, eventId: ctx.eventId ?? null },
        summaryOpts: { note: ctx.note ?? null, simulatedOperator: ctx.actor === 'simulated_operator' },
      });
    });
    this.publish([change]);
    return { incident: change.incident };
  }

  /** GET /scenarios/:id/history: incident changes of the current run, with snapshots, by seq. */
  async history(scenarioId: string): Promise<HistoryResponse> {
    const row = await this.scenarios.requireRow(scenarioId);
    const rows = await this.db
      .select()
      .from(incidentEvents)
      .where(and(eq(incidentEvents.scenarioId, scenarioId), gt(incidentEvents.seq, row.resetSeq)))
      .orderBy(asc(incidentEvents.seq));
    const entries = rows.flatMap((r) => {
      const snapshot = (r.payload as { snapshot?: Incident }).snapshot;
      return snapshot ? [{ seq: r.seq, atS: r.atS, kind: r.kind, summary: r.summary, incident: snapshot }] : [];
    });
    return { scenarioId, runId: row.runId, resetSeq: row.resetSeq, entries };
  }

  /** Incident created or touched by a scripted event (for verify/resolve/dismiss targets). */
  async incidentForEvent(scenarioId: string, eventId: string): Promise<string | null> {
    const rows = await this.db
      .select({ incidentId: incidentEvents.incidentId })
      .from(incidentEvents)
      .where(and(eq(incidentEvents.scenarioId, scenarioId), sql`${incidentEvents.payload}->>'eventId' = ${eventId}`))
      .orderBy(asc(incidentEvents.seq))
      .limit(1);
    return rows[0]?.incidentId ?? null;
  }
}
