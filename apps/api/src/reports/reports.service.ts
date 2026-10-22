import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  OBSERVED_AT_MAX_AGE_S,
  OFFMAP_REPORTS_LIMIT,
  type OffMapReportsResponse,
  type CongestionLevel,
  type Depth,
  type IncidentSource,
  type ReportInput,
  type ReportOrigin,
  type ReportOutcome,
  type ReportResponse,
  type Severity,
} from '@vighnaway/contracts';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiException } from '../common/errors';
import { saltedHash } from '../common/hash';
import { plainText } from '../common/validation';
import type { Db, Tx } from '../db/client';
import { DB } from '../db/db.module';
import { incidentReports, offmapReports } from '../db/schema';
import { type IncidentChange, type IncidentDraft, IncidentsService, toIncident } from '../incidents/incidents.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimClockService } from '../scenarios/sim-clock.service';

/** Report rules (docs/DATA_MODEL.md). Same numbers as packages/scenario-data/scripts/replay.ts. */
export const REPORT_RULES = {
  snapM: 30,
  extentM: { congestion: 600, default: 60 },
  nearM: 150,
  duplicateWindowS: 600,
  corroborationWindowS: 1800,
  corroborationDevices: 2,
  clearDevicesToResolve: 2,
  /** One answer to the data-gap question per road per device per 30 simulated minutes. */
  promptWindowS: 1800,
  /** Walking concerns (P2-8) are limited more tightly than other reports: this many per device per 30 simulated minutes. */
  concernPerDevice: 3,
  concernWindowS: 1800,
} as const;

const DEPTH_RANK: Record<Depth, number> = { ankle: 1, knee: 2, waist: 3 };
const CONGESTION_RANK: Record<CongestionLevel, number> = { moderate: 1, heavy: 2, standstill: 3 };
const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
const deeper = <T extends string>(rank: Record<T, number>, a: T | null, b: T | null | undefined): T | null =>
  b == null ? a : a == null || rank[b] > rank[a] ? b : a;

const offMapReceipt = (reportId: string, scenarioId: string, receivedAtS: number): ReportResponse => ({
  receipt: { reportId, scenarioId, outcome: 'off_map', receivedAtS, snappedEdgeId: null, roadName: null, distanceToRoadM: null },
  incident: null,
});

const OPEN = sql`('unverified','corroborated','verified')`;

export interface ReportContext {
  /** Server time (simulation seconds). Real reports: the current clock. Scripted: the event's atS. */
  nowS?: number;
  source: Extract<IncidentSource, 'simulated' | 'user_report'>;
  ip?: string | null;
  /** Signed-in reporter (users.id). Stored for history and thanks; never read by routing or corroboration. */
  userId?: string | null;
  /** Deterministic ids for scripted events (`<scenario>:rep:<eventId>`, `<scenario>:inc:<eventId>`). */
  reportId?: string;
  newIncidentId?: string;
  eventId?: string;
}

interface Snap {
  id: string;
  reverseId: string | null;
  name: string | null;
  d: number;
}

const randomId = (scenarioId: string, kind: 'rep' | 'inc' | 'off') =>
  `${scenarioId}:${kind}:u${randomBytes(8).toString('hex')}`;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
    @Inject(SimClockService) private readonly clock: SimClockService,
  ) {}

  hashDevice(deviceId: string): string {
    return saltedHash(this.config.deviceHashSalt, deviceId);
  }

  /**
   * Applies one report: snap, then Road clear / duplicate / attach / create / link, merge
   * evidence and corroborate, all in one transaction that also takes the scenario's next seq
   * and appends incident_events. incident.upserted is emitted only after commit.
   */
  async submit(scenarioId: string, input: ReportInput, ctx: ReportContext): Promise<ReportResponse> {
    const nowS = ctx.nowS ?? (await this.clock.nowS(scenarioId));
    if (input.observedAtS != null && (input.observedAtS > nowS || input.observedAtS < nowS - OBSERVED_AT_MAX_AGE_S)) {
      throw new ApiException('VALIDATION_FAILED', 'observedAtS must be within the last 2 hours and not in the future', [
        { path: ['observedAtS'], code: 'custom', message: 'Outside the last 2 simulated hours' },
      ]);
    }
    const changes: IncidentChange[] = [];
    const response = await this.db.transaction(async (tx) => {
      const scenarioRow = await this.scenarios.lock(tx, scenarioId);
      // The same report relayed twice (offline relay, a retry) is stored once: a repeat id gets the original receipt.
      if (input.clientReportId) {
        const original = await this.originalReceipt(tx, scenarioRow.graphVersion, scenarioId, input.clientReportId);
        if (original) return original;
        const offmap = await this.originalOffMap(tx, scenarioId, input.clientReportId);
        if (offmap) return offmap;
      }
      const pt = sql`ST_SetSRID(ST_MakePoint(${input.point.lng}::float8, ${input.point.lat}::float8), 4326)`;
      const snap = await this.snap(tx, scenarioRow.graphVersion, pt);
      const deviceHash = this.hashDevice(input.deviceId);
      const origin: ReportOrigin = input.origin ?? 'app';
      if (!snap) {
        // Live mode takes a report from anywhere. With no mapped road it is saved as off-map: it creates no
        // incident and changes no route. The scripted demo, audience and prompt reports stay strict.
        const live = (scenarioRow.definition as { simulated?: boolean }).simulated === false;
        if (live && ctx.source === 'user_report' && (origin === 'app' || origin === 'web')) {
          return this.saveOffMap(tx, scenarioId, input, { nowS, deviceHash, origin, ctx });
        }
        throw new ApiException('NOT_ON_ROAD', 'Not on a known road', {
          maxDistanceM: REPORT_RULES.snapM,
        });
      }
      if (input.type === 'walking_concern') await this.requireWithinConcernLimit(tx, scenarioId, deviceHash, nowS);
      if (origin === 'prompt') await this.requireNoRecentPromptAnswer(tx, scenarioRow.graphVersion, scenarioId, deviceHash, snap, nowS);
      const base = {
        scenarioId,
        type: input.type,
        depth: input.type === 'flood' ? (input.depth ?? null) : null,
        congestion: input.type === 'congestion' ? (input.congestion ?? null) : null,
        severity: input.type === 'debris' || input.type === 'accident' ? (input.severity ?? null) : null,
        concern: input.type === 'walking_concern' ? (input.concern ?? null) : null,
        impassable: input.impassable ?? false,
        observedPersonally: input.observedPersonally,
        description: plainText(input.description),
        deviceHash,
        ipHash: ctx.ip ? saltedHash(this.config.deviceHashSalt, ctx.ip) : null,
        source: ctx.source,
        origin,
        userId: ctx.userId ?? null,
        receivedAtS: nowS,
        snappedEdgeId: snap.id,
        distanceToRoadM: Math.round(snap.d * 10) / 10,
        geom: [input.point.lng, input.point.lat] as [number, number],
      };
      // Only a new report row carries the device's id, claim and outcome; a duplicate update leaves the original's.
      const client = { clientReportId: input.clientReportId ?? null, observedAtS: input.observedAtS ?? null };
      const receipt = (reportId: string, outcome: ReportOutcome) => ({
        reportId,
        scenarioId,
        outcome,
        receivedAtS: nowS,
        snappedEdgeId: snap.id,
        roadName: snap.name,
        distanceToRoadM: base.distanceToRoadM,
      });
      const actor = `device:${deviceHash.slice(0, 12)}`;
      const payloadFor = (reportId: string, outcome: ReportOutcome) => ({
        reportId,
        eventId: ctx.eventId ?? null,
        outcome,
        source: ctx.source,
      });

      // Road clear: never creates an incident.
      if (input.type === 'road_clear') {
        const near = await this.openNear(tx, scenarioId, pt, null);
        const dup = await this.duplicateOf(tx, scenarioId, null, deviceHash, pt, nowS, true);
        const reportId = dup ?? ctx.reportId ?? randomId(scenarioId, 'rep');
        const incidentId = near[0] ?? null;
        if (dup) {
          await tx.update(incidentReports).set({ ...base, incidentId }).where(eq(incidentReports.id, dup));
        } else {
          await tx.insert(incidentReports).values({ ...base, ...client, id: reportId, incidentId });
        }
        let outcome: ReportOutcome = 'clear_noted';
        for (const id of near) {
          const row = (await this.incidents.findRow(tx, scenarioId, id))!;
          const { seq: _seq, ...draft } = row;
          const clearDevices = await this.clearDevices(tx, scenarioId, id, row.createdAtS);
          // An answer to a data-gap question is an observation: it may mark the incident Conflicting but never resolves it.
          const resolve = clearDevices >= REPORT_RULES.clearDevicesToResolve && origin !== 'prompt';
          const next: IncidentDraft = { ...draft, conflicting: true, updatedAtS: nowS };
          if (resolve) {
            next.status = 'resolved';
            next.closedAtS = nowS;
          }
          const kind: ReportOutcome = resolve ? 'resolved_by_clear_reports' : 'marked_conflicting';
          if (resolve) outcome = 'resolved_by_clear_reports';
          else if (outcome === 'clear_noted') outcome = 'marked_conflicting';
          changes.push(
            await this.incidents.recordChange(tx, next, {
              kind,
              actor,
              atS: nowS,
              payload: payloadFor(reportId, kind),
              summaryOpts: { clearDevices },
            }),
          );
        }
        const first = changes[0]?.incident ?? null;
        await this.keepOutcome(tx, reportId, outcome);
        return { receipt: receipt(reportId, outcome), incident: first };
      }

      const extent = await this.extent(tx, scenarioRow.graphVersion, pt, snap, input.type);
      const openId = (await this.openNear(tx, scenarioId, pt, input.type, base.concern))[0] ?? null;
      let draft: IncidentDraft;
      let outcome: ReportOutcome;
      let reportId: string;
      if (openId) {
        const row = (await this.incidents.findRow(tx, scenarioId, openId))!;
        const { seq: _seq, ...prev } = row;
        draft = {
          ...prev,
          edgeIds: [...new Set([...prev.edgeIds, ...extent])].sort(),
          depth: deeper(DEPTH_RANK, prev.depth as Depth | null, base.depth),
          congestion: deeper(CONGESTION_RANK, prev.congestion as CongestionLevel | null, base.congestion),
          severity: deeper(SEVERITY_RANK, prev.severity as Severity | null, base.severity),
          impassable: prev.impassable || base.impassable,
          audienceOnly: prev.audienceOnly && origin === 'audience',
          note: base.description ?? prev.note,
          lastReportAtS: nowS,
          updatedAtS: nowS,
        };
        const dup = await this.duplicateOf(tx, scenarioId, openId, deviceHash, pt, nowS, false);
        if (dup) {
          reportId = dup;
          await tx.update(incidentReports).set({ ...base, incidentId: openId }).where(eq(incidentReports.id, dup));
          outcome = 'updated_duplicate';
        } else {
          reportId = ctx.reportId ?? randomId(scenarioId, 'rep');
          await tx.insert(incidentReports).values({ ...base, ...client, id: reportId, incidentId: openId });
          outcome = 'attached';
        }
      } else {
        const resolved = await this.resolvedNear(tx, scenarioId, pt, input.type);
        const id = ctx.newIncidentId ?? randomId(scenarioId, 'inc');
        draft = {
          id,
          scenarioId,
          type: input.type,
          status: 'unverified',
          source: ctx.source,
          depth: base.depth,
          congestion: base.congestion,
          severity: base.severity,
          concern: base.concern,
          impassable: input.type === 'closure' || base.impassable,
          conflicting: false,
          edgeIds: extent,
          roadName: snap.name,
          reportCount: 0,
          deviceCount: 0,
          createdAtS: nowS,
          lastReportAtS: nowS,
          updatedAtS: nowS,
          verifiedAtS: null,
          verifiedBy: null,
          closedAtS: null,
          linkedIncidentId: resolved,
          note: base.description,
          geom: base.geom,
          feed: null,
          audienceOnly: origin === 'audience',
        };
        reportId = ctx.reportId ?? randomId(scenarioId, 'rep');
        await tx.insert(incidentReports).values({ ...base, ...client, id: reportId, incidentId: id });
        outcome = resolved ? 'linked_new_incident' : 'created_incident';
      }

      const counts = await this.counts(tx, draft.id, pt, nowS);
      draft.reportCount = counts.reports;
      draft.deviceCount = counts.devices;
      if (draft.status === 'unverified' && counts.devicesNear >= REPORT_RULES.corroborationDevices) {
        draft.status = 'corroborated';
        if (outcome === 'attached' || outcome === 'updated_duplicate') outcome = 'corroborated';
      }
      const change = await this.incidents.recordChange(tx, draft, {
        kind: outcome,
        actor,
        atS: nowS,
        payload: payloadFor(reportId, outcome),
      });
      changes.push(change);
      await this.keepOutcome(tx, reportId, outcome);
      return { receipt: receipt(reportId, outcome), incident: change.incident };
    });
    this.incidents.publish(changes);
    return response;
  }

  /** Newest live-mode off-map reports (operator triage). No device or reporter identity leaves the server. */
  async listOffMap(scenarioId: string): Promise<OffMapReportsResponse> {
    const where = eq(offmapReports.scenarioId, scenarioId);
    const [rows, [count]] = await Promise.all([
      this.db.select().from(offmapReports).where(where).orderBy(desc(offmapReports.receivedAtS), desc(offmapReports.id)).limit(OFFMAP_REPORTS_LIMIT),
      this.db.select({ n: sql<number>`count(*)::int` }).from(offmapReports).where(where),
    ]);
    return {
      scenarioId,
      total: count?.n ?? 0,
      reports: rows.map((r) => ({
        id: r.id,
        type: r.type as ReportInput['type'],
        depth: r.depth as Depth | null,
        congestion: r.congestion as CongestionLevel | null,
        severity: r.severity as Severity | null,
        description: r.description,
        point: { lat: r.geom[1], lng: r.geom[0] },
        receivedAtS: r.receivedAtS,
      })),
    };
  }

  /** Stores a report that has no mapped road nearby (live mode). Never touches incidents or routing. */
  private async saveOffMap(
    tx: Tx,
    scenarioId: string,
    input: ReportInput,
    v: { nowS: number; deviceHash: string; origin: ReportOrigin; ctx: ReportContext },
  ): Promise<ReportResponse> {
    const id = randomId(scenarioId, 'off');
    await tx.insert(offmapReports).values({
      id,
      scenarioId,
      type: input.type,
      depth: input.type === 'flood' ? (input.depth ?? null) : null,
      congestion: input.type === 'congestion' ? (input.congestion ?? null) : null,
      severity: input.type === 'debris' || input.type === 'accident' ? (input.severity ?? null) : null,
      impassable: input.impassable ?? false,
      observedPersonally: input.observedPersonally,
      description: plainText(input.description),
      deviceHash: v.deviceHash,
      ipHash: v.ctx.ip ? saltedHash(this.config.deviceHashSalt, v.ctx.ip) : null,
      source: v.ctx.source,
      origin: v.origin,
      userId: v.ctx.userId ?? null,
      clientReportId: input.clientReportId ?? null,
      observedAtS: input.observedAtS ?? null,
      receivedAtS: v.nowS,
      geom: [input.point.lng, input.point.lat] as [number, number],
    });
    return offMapReceipt(id, scenarioId, v.nowS);
  }

  /** Remembers the receipt's outcome on the report row so a repeat of its client id can return it again. */
  private async keepOutcome(tx: Tx, reportId: string, outcome: ReportOutcome): Promise<void> {
    await tx.update(incidentReports).set({ outcome }).where(eq(incidentReports.id, reportId));
  }

  private async originalOffMap(tx: Tx, scenarioId: string, clientReportId: string): Promise<ReportResponse | null> {
    const [row] = await tx
      .select({ id: offmapReports.id, receivedAtS: offmapReports.receivedAtS })
      .from(offmapReports)
      .where(and(eq(offmapReports.scenarioId, scenarioId), eq(offmapReports.clientReportId, clientReportId)))
      .limit(1);
    return row ? offMapReceipt(row.id, scenarioId, row.receivedAtS) : null;
  }

  /** The receipt (and the incident as it is now) for a report this scenario already stored under `clientReportId`. */
  private async originalReceipt(tx: Tx, graphVersion: string, scenarioId: string, clientReportId: string): Promise<ReportResponse | null> {
    const [row] = await tx
      .select()
      .from(incidentReports)
      .where(and(eq(incidentReports.scenarioId, scenarioId), eq(incidentReports.clientReportId, clientReportId)))
      .limit(1);
    if (!row) return null;
    const edge = await tx.execute<{ name: string | null }>(sql`SELECT name FROM road_edges WHERE graph_version = ${graphVersion} AND id = ${row.snappedEdgeId} LIMIT 1`);
    const incidentRow = row.incidentId ? await this.incidents.findRow(tx, scenarioId, row.incidentId) : null;
    return {
      receipt: {
        reportId: row.id,
        scenarioId,
        outcome: (row.outcome ?? 'attached') as ReportOutcome,
        receivedAtS: row.receivedAtS,
        snappedEdgeId: row.snappedEdgeId,
        roadName: edge[0]?.name ?? null,
        distanceToRoadM: row.distanceToRoadM,
      },
      incident: incidentRow ? toIncident(incidentRow) : null,
    };
  }

  /**
   * A device answers the data-gap question for a road at most once per 30 simulated minutes (409 on a
   * repeat). A road is the snapped edge, its twin, or any edge with the same name.
   */
  private async requireNoRecentPromptAnswer(tx: Tx, graphVersion: string, scenarioId: string, deviceHash: string, snap: Snap, nowS: number): Promise<void> {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT r.id FROM incident_reports r
      JOIN road_edges e ON e.id = r.snapped_edge_id AND e.graph_version = ${graphVersion}
      WHERE r.scenario_id = ${scenarioId} AND r.device_hash = ${deviceHash} AND r.origin = 'prompt'
        AND r.received_at_s > ${nowS - REPORT_RULES.promptWindowS}
        AND (r.snapped_edge_id = ${snap.id}
          ${snap.reverseId ? sql`OR r.snapped_edge_id = ${snap.reverseId}` : sql``}
          ${snap.name ? sql`OR e.name = ${snap.name}` : sql``})
      LIMIT 1`);
    if (rows.length > 0) {
      throw new ApiException('CONFLICT', 'You already answered for this road in the last 30 minutes', { windowS: REPORT_RULES.promptWindowS });
    }
  }

  /** A device may send only a few walking concerns per half hour (P2-8): 429 after that. */
  private async requireWithinConcernLimit(tx: Tx, scenarioId: string, deviceHash: string, nowS: number): Promise<void> {
    const rows = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM incident_reports
      WHERE scenario_id = ${scenarioId} AND device_hash = ${deviceHash} AND type = 'walking_concern'
        AND received_at_s > ${nowS - REPORT_RULES.concernWindowS}`);
    if (Number(rows[0]?.n ?? 0) >= REPORT_RULES.concernPerDevice) {
      throw new ApiException('RATE_LIMITED', 'Too many walking concern reports from this device. Try again later.', { windowS: REPORT_RULES.concernWindowS });
    }
  }

  /** Nearest road edge within 30 m (geodesic distance; ties broken by id). */
  private async snap(tx: Tx, graphVersion: string, pt: SQL): Promise<Snap | null> {
    const rows = await tx.execute<{ id: string; reverse_id: string | null; name: string | null; d: number }>(sql`
      SELECT id, reverse_id, name, ST_Distance(geom::geography, ${pt}::geography) AS d
      FROM road_edges
      WHERE graph_version = ${graphVersion}
        AND ST_DWithin(geom::geography, ${pt}::geography, ${REPORT_RULES.snapM})
      ORDER BY d, geom <-> ${pt}, id
      LIMIT 1`);
    const r = rows[0];
    return r ? { id: r.id, reverseId: r.reverse_id, name: r.name, d: Number(r.d) } : null;
  }

  /** Snapped edge and its twin, plus the same named road within 60 m (600 m for congestion). */
  private async extent(tx: Tx, graphVersion: string, pt: SQL, snap: Snap, type: ReportInput['type']): Promise<string[]> {
    const ids = new Set<string>([snap.id]);
    if (snap.reverseId) ids.add(snap.reverseId);
    if (snap.name) {
      const radius = type === 'congestion' ? REPORT_RULES.extentM.congestion : REPORT_RULES.extentM.default;
      const rows = await tx.execute<{ id: string }>(sql`
        SELECT id FROM road_edges
        WHERE graph_version = ${graphVersion} AND name = ${snap.name}
          AND ST_DWithin(geom::geography, ${pt}::geography, ${radius})`);
      for (const r of rows) ids.add(r.id);
    }
    return [...ids].sort();
  }

  /** Open incidents (of `type`, or any type for Road clear) with a supporting report within 150 m. */
  private async openNear(tx: Tx, scenarioId: string, pt: SQL, type: string | null, concern: string | null = null): Promise<string[]> {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT DISTINCT i.id FROM incidents i
      JOIN incident_reports r ON r.incident_id = i.id AND r.type <> 'road_clear'
      WHERE i.scenario_id = ${scenarioId}
        AND i.status IN ${OPEN}
        ${type ? sql`AND i.type = ${type}` : sql`AND i.type <> 'walking_concern'`}
        ${concern ? sql`AND i.concern = ${concern}` : sql``}
        AND ST_DWithin(r.geom::geography, ${pt}::geography, ${REPORT_RULES.nearM})
      ORDER BY i.id`);
    return rows.map((r) => r.id);
  }

  /** Nearest Resolved incident of the same type within 150 m (late reports link to it). */
  private async resolvedNear(tx: Tx, scenarioId: string, pt: SQL, type: string): Promise<string | null> {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT i.id, min(ST_Distance(r.geom::geography, ${pt}::geography)) AS d FROM incidents i
      JOIN incident_reports r ON r.incident_id = i.id AND r.type <> 'road_clear'
      WHERE i.scenario_id = ${scenarioId} AND i.type = ${type} AND i.status = 'resolved'
        AND ST_DWithin(r.geom::geography, ${pt}::geography, ${REPORT_RULES.nearM})
      GROUP BY i.id
      ORDER BY d, i.id
      LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  /** The same device's earlier report within 150 m and 10 simulated minutes. */
  private async duplicateOf(
    tx: Tx,
    scenarioId: string,
    incidentId: string | null,
    deviceHash: string,
    pt: SQL,
    nowS: number,
    roadClear: boolean,
  ): Promise<string | null> {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM incident_reports
      WHERE scenario_id = ${scenarioId} AND device_hash = ${deviceHash}
        ${roadClear ? sql`AND type = 'road_clear'` : sql`AND type <> 'road_clear' AND incident_id = ${incidentId}`}
        AND received_at_s >= ${nowS - REPORT_RULES.duplicateWindowS}
        AND ST_DWithin(geom::geography, ${pt}::geography, ${REPORT_RULES.nearM})
      ORDER BY received_at_s DESC, id DESC
      LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  /** Report and device counts, and distinct devices within 150 m and 30 simulated minutes. */
  private async counts(tx: Tx, incidentId: string, pt: SQL, nowS: number) {
    const rows = await tx.execute<{ reports: number; devices: number; devices_near: number }>(sql`
      SELECT count(*)::int AS reports,
             count(DISTINCT device_hash)::int AS devices,
             count(DISTINCT device_hash) FILTER (
               WHERE received_at_s >= ${nowS - REPORT_RULES.corroborationWindowS}
                 AND ST_DWithin(geom::geography, ${pt}::geography, ${REPORT_RULES.nearM})
             )::int AS devices_near
      FROM incident_reports
      WHERE incident_id = ${incidentId} AND type <> 'road_clear'`);
    const r = rows[0]!;
    return { reports: Number(r.reports), devices: Number(r.devices), devicesNear: Number(r.devices_near) };
  }

  /**
   * Distinct devices that sent Road clear reports since the incident was created, within 150 m
   * of any of its supporting reports.
   */
  private async clearDevices(tx: Tx, scenarioId: string, incidentId: string, sinceS: number): Promise<number> {
    const rows = await tx.execute<{ n: number }>(sql`
      SELECT count(DISTINCT c.device_hash)::int AS n FROM incident_reports c
      WHERE c.scenario_id = ${scenarioId} AND c.type = 'road_clear' AND c.received_at_s >= ${sinceS}
        AND EXISTS (
          SELECT 1 FROM incident_reports r
          WHERE r.incident_id = ${incidentId} AND r.type <> 'road_clear'
            AND ST_DWithin(r.geom::geography, c.geom::geography, ${REPORT_RULES.nearM})
        )`);
    return Number(rows[0]?.n ?? 0);
  }
}
