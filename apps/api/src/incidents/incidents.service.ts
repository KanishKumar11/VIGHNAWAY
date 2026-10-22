import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  type ClearAudienceResponse,
  type ClosureRequest,
  type ClosureResponse,
  type HistoryResponse,
  type Incident,
  type IncidentsResponse,
  type ObservationPayload,
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

/** P2-6: how close a drawn closure must run to a road to match it, and how many segments it may cover. */
const CLOSURE_MATCH_M = 15;
const CLOSURE_MAX_EDGES = 80;

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
    ...(row.concern ? { concern: row.concern as Incident['concern'] } : {}),
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
    ...(row.audienceOnly ? { audienceOnly: true } : {}),
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
    const { row, list, full, observations } = await this.db.transaction(
      async (tx) => {
        const row = await this.scenarios.requireRow(scenarioId, tx);
        const full = sinceSeq === undefined || sinceSeq < row.resetSeq || sinceSeq > row.seq;
        const where = full
          ? eq(incidents.scenarioId, scenarioId)
          : and(eq(incidents.scenarioId, scenarioId), gt(incidents.seq, sinceSeq!));
        const list = await tx.select().from(incidents).where(where).orderBy(asc(incidents.id));
        const observations = await this.observations(tx, scenarioId, row.graphVersion);
        return { row, list, full, observations };
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
      observations,
    };
  }

  /**
   * Latest observation per flood-prone edge from any report, Road clear included (it creates no
   * incident). Both directions of a two-way road are listed. Lets clients tell "no reports" from
   * "reports say clear"; it never removes a hazard penalty or a block.
   */
  private async observations(tx: Tx, scenarioId: string, graphVersion: string): Promise<ObservationPayload[]> {
    const rows = await tx.execute<{ edge_id: string; reverse_id: string | null; at_s: number; type: string }>(sql`
      SELECT DISTINCT ON (r.snapped_edge_id) r.snapped_edge_id AS edge_id, e.reverse_id AS reverse_id,
             r.received_at_s AS at_s, r.type AS type
      FROM incident_reports r
      JOIN road_edges e ON e.id = r.snapped_edge_id AND e.graph_version = ${graphVersion}
      WHERE r.scenario_id = ${scenarioId} AND e.flood_prone
      ORDER BY r.snapped_edge_id, r.received_at_s DESC, r.id DESC`);
    const out: ObservationPayload[] = [];
    for (const r of rows) {
      const base = { lastObservedAtS: Number(r.at_s), kind: r.type === 'road_clear' ? ('clear' as const) : ('hazard' as const) };
      out.push({ edgeId: r.edge_id, ...base });
      if (r.reverse_id) out.push({ edgeId: r.reverse_id, ...base });
    }
    return out.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  }

  /**
   * POST /scenarios/:id/audience/clear: dismisses every open incident that only demo-audience reports
   * support, one logged change each, then broadcasts them. Scripted and mixed-origin incidents stay.
   */
  async clearAudience(scenarioId: string): Promise<ClearAudienceResponse> {
    const nowS = await this.clock.nowS(scenarioId);
    const note = 'Demo audience reports cleared';
    const changes = await this.db.transaction(async (tx) => {
      await this.scenarios.lock(tx, scenarioId);
      const rows = await tx
        .select()
        .from(incidents)
        .where(and(eq(incidents.scenarioId, scenarioId), eq(incidents.audienceOnly, true), inArray(incidents.status, ['unverified', 'corroborated', 'verified'])))
        .orderBy(asc(incidents.id));
      const out: IncidentChange[] = [];
      for (const row of rows) {
        const { seq: _seq, ...draft } = row;
        out.push(
          await this.recordChange(
            tx,
            { ...draft, status: 'dismissed', closedAtS: nowS, updatedAtS: nowS },
            {
              kind: 'dismissed',
              actor: 'operator',
              atS: nowS,
              payload: { action: 'dismiss', note, eventId: null, bulk: 'audience' },
              summaryOpts: { note },
            },
          ),
        );
      }
      return out;
    });
    this.publish(changes);
    return { cleared: changes.length, incidentIds: changes.map((c) => c.incident.id) };
  }

  /**
   * P2-6: edges within CLOSURE_MATCH_M of the drawn line (both directions; deterministic, sorted),
   * previewed or, with `confirm`, recorded as one Verified closure by the operator. A line that
   * matches no road is 422; one that matches more than CLOSURE_MAX_EDGES is refused as too long.
   */
  async closeRoad(scenarioId: string, body: ClosureRequest): Promise<ClosureResponse> {
    const scenarioRow = await this.scenarios.requireRow(scenarioId);
    const wkt = `LINESTRING(${body.polyline.map((p) => `${Number(p.lng)} ${Number(p.lat)}`).join(', ')})`;
    const rows = await this.db.execute<{ id: string; name: string | null; length_m: number }>(sql`
      WITH line AS (SELECT ST_GeomFromText(${wkt}, 4326)::geography AS g)
      SELECT e.id, e.name, e.length_m FROM road_edges e, line
      WHERE e.graph_version = ${scenarioRow.graphVersion}
        AND ST_DWithin(e.geom::geography, line.g, ${CLOSURE_MATCH_M})
        -- An edge follows the line when at least two of its start, middle and end are near it; a cross street
        -- that only touches the line at a junction has one.
        AND ((ST_DWithin(ST_StartPoint(e.geom)::geography, line.g, ${CLOSURE_MATCH_M}))::int
           + (ST_DWithin(ST_LineInterpolatePoint(e.geom, 0.5)::geography, line.g, ${CLOSURE_MATCH_M}))::int
           + (ST_DWithin(ST_EndPoint(e.geom)::geography, line.g, ${CLOSURE_MATCH_M}))::int) >= 2
      ORDER BY e.id`);
    if (rows.length === 0) throw new ApiException('NOT_ON_ROAD', 'The line does not follow a known road');
    if (rows.length > CLOSURE_MAX_EDGES) {
      throw new ApiException('VALIDATION_FAILED', `The line matches ${rows.length} road segments; draw a shorter closure (at most ${CLOSURE_MAX_EDGES})`);
    }
    const edgeIds = rows.map((r) => r.id);
    const names = new Map<string, number>();
    for (const r of rows) if (r.name) names.set(r.name, (names.get(r.name) ?? 0) + Number(r.length_m));
    const roadNames = [...names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([n]) => n);
    // Both directions of a two-way road are in the match, so count each road length once.
    const lengthM = Math.round(rows.reduce((n, r) => n + Number(r.length_m), 0) / 2);
    const preview = { edgeIds, roadNames, lengthM };
    if (!body.confirm) return { preview, incident: null };

    const nowS = await this.clock.nowS(scenarioId);
    const first = body.polyline[0]!;
    const change = await this.db.transaction(async (tx) => {
      await this.scenarios.lock(tx, scenarioId);
      const open = await tx
        .select({ id: incidents.id, edgeIds: incidents.edgeIds })
        .from(incidents)
        .where(and(eq(incidents.scenarioId, scenarioId), eq(incidents.type, 'closure'), inArray(incidents.status, ['unverified', 'corroborated', 'verified'])));
      if (open.some((o) => edgeIds.every((id) => (o.edgeIds as string[]).includes(id)))) {
        throw new ApiException('CONFLICT', 'These roads are already covered by an open closure');
      }
      const draft: IncidentDraft = {
        id: `${scenarioId}:inc:op${randomBytes(8).toString('hex')}`,
        scenarioId,
        type: 'closure',
        status: 'verified',
        source: 'operator',
        depth: null,
        congestion: null,
        severity: null,
        impassable: true,
        conflicting: false,
        edgeIds,
        roadName: roadNames[0] ?? null,
        reportCount: 0,
        deviceCount: 0,
        createdAtS: nowS,
        lastReportAtS: nowS,
        updatedAtS: nowS,
        verifiedAtS: nowS,
        audienceOnly: false,
        verifiedBy: 'operator',
        closedAtS: null,
        linkedIncidentId: null,
        note: body.note ?? null,
        geom: [first.lng, first.lat],
      } as IncidentDraft;
      return this.recordChange(tx, draft, {
        kind: 'created_incident',
        actor: 'operator',
        atS: nowS,
        payload: { control: 'drawn_closure', points: body.polyline.length, edges: edgeIds.length },
        summaryOpts: { note: body.note ?? null },
      });
    });
    this.publish([change]);
    return { preview, incident: change.incident };
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
