import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { type FeedRef, type FeedStatus, isOpenStatus, type Incident } from '@vighnaway/contracts';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiException } from '../common/errors';
import type { Db, Tx } from '../db/client';
import { DB } from '../db/db.module';
import { incidents, type IncidentRow } from '../db/schema';
import { type IncidentChange, type IncidentDraft, IncidentsService } from '../incidents/incidents.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { SimClockService } from '../scenarios/sim-clock.service';
import {
  type Bbox,
  type CandidateEdge,
  type FeedHazard,
  feedIncidentId,
  fetchTomTomIncidents,
  mapTomTomIncident,
  matchEdges,
  TomTomError,
} from './tomtom';

export interface PollResult {
  fetched: number;
  invalid: number;
  skipped: number;
  unmatched: number;
  created: number;
  updated: number;
  cleared: number;
}

/** Republish an unchanged feed incident this often so its age (and the engine's age factor) stays current. */
export const FEED_REFRESH_S = 15 * 60;
export const TOMTOM_ATTRIBUTION = 'Traffic data © TomTom';

type Status = Omit<FeedStatus, 'scenarioId' | 'provider' | 'pollIntervalS' | 'attribution'>;

/**
 * TomTom live traffic feed. Polls Incident Details for the live scenario's bounding box, turns
 * supported incidents into VIGHNAWAY incidents (source 'live_feed', provider attribution) on the
 * graph edges they lie on, updates them while they persist and resolves them when they leave the
 * feed. Every change goes through IncidentsService.recordChange (seq, audit event) and is
 * published after commit, exactly like reports. It never runs for simulated scenarios.
 */
@Injectable()
export class TrafficFeedService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('TrafficFeed');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<PollResult> | null = null;
  private status: Status = { enabled: false, reason: null, lastPollAtS: null, lastSuccessAtS: null, lastError: null, activeIncidents: 0 };

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
    @Inject(IncidentsService) private readonly incidentsService: IncidentsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const t = this.config.traffic;
    const row = await this.scenarios.getRow(t.scenarioId);
    if (!t.tomtomApiKey) this.status = { ...this.status, enabled: false, reason: 'TOMTOM_API_KEY not set' };
    else if (!row) this.status = { ...this.status, enabled: false, reason: `Scenario ${t.scenarioId} not found (run db:seed)` };
    else if (this.scenarios.definition(row).mode !== 'live') {
      this.status = { ...this.status, enabled: false, reason: `Scenario ${t.scenarioId} is not a live scenario` };
    } else {
      this.status = { ...this.status, enabled: true, reason: null };
      if (t.pollSeconds > 0) {
        const first = setTimeout(() => void this.pollNow().catch(() => undefined), 2000);
        first.unref?.();
        this.timer = setInterval(() => void this.pollNow().catch(() => undefined), t.pollSeconds * 1000);
        this.timer.unref?.();
      }
    }
    this.logger.log(this.status.enabled ? `TomTom feed on for ${t.scenarioId}, every ${t.pollSeconds} s` : `TomTom feed off: ${this.status.reason}`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async feedStatus(scenarioId: string): Promise<FeedStatus> {
    const row = await this.scenarios.requireRow(scenarioId);
    const isFeedScenario = scenarioId === this.config.traffic.scenarioId && this.scenarios.definition(row).mode === 'live';
    const reason = isFeedScenario ? this.status.reason : 'The live traffic feed only runs for the live scenario';
    return {
      scenarioId,
      provider: 'tomtom',
      ...this.status,
      enabled: isFeedScenario && this.status.enabled,
      reason: isFeedScenario && this.status.enabled ? null : reason,
      activeIncidents: isFeedScenario ? this.status.activeIncidents : 0,
      pollIntervalS: Math.max(1, this.config.traffic.pollSeconds),
      attribution: TOMTOM_ATTRIBUTION,
    };
  }

  /** One poll; concurrent callers share the in-flight poll. */
  pollNow(scenarioId = this.config.traffic.scenarioId): Promise<PollResult> {
    if (scenarioId !== this.config.traffic.scenarioId) {
      return Promise.reject(new ApiException('CONFLICT', 'The live traffic feed only runs for the live scenario'));
    }
    if (!this.status.enabled) {
      return Promise.reject(new ApiException('CONFLICT', `Live traffic feed is off: ${this.status.reason ?? 'disabled'}`));
    }
    if (!this.running) {
      this.running = this.poll(scenarioId).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async poll(scenarioId: string): Promise<PollResult> {
    const nowS = await this.clock.nowS(scenarioId);
    this.status.lastPollAtS = nowS;
    const row = await this.scenarios.requireRow(scenarioId);
    const result: PollResult = { fetched: 0, invalid: 0, skipped: 0, unmatched: 0, created: 0, updated: 0, cleared: 0 };
    let fetched;
    try {
      fetched = await fetchTomTomIncidents({
        baseUrl: this.config.traffic.tomtomBaseUrl,
        key: this.config.traffic.tomtomApiKey,
        bbox: await this.bbox(row.graphVersion),
      });
    } catch (err) {
      const message = err instanceof TomTomError ? err.message : `TomTom poll failed: ${String(err)}`;
      this.status.lastError = message;
      this.logger.warn(message);
      throw new ApiException('INTERNAL', message);
    }
    result.fetched = fetched.incidents.length;
    result.invalid = fetched.invalid;

    const hazards: { hazard: FeedHazard; edgeIds: string[]; roadName: string | null }[] = [];
    for (const raw of fetched.incidents) {
      const hazard = mapTomTomIncident(raw);
      if (!hazard) {
        result.skipped++;
        continue;
      }
      const candidates = await this.candidates(row.graphVersion, hazard.coordinates);
      const edgeIds = matchEdges(hazard, candidates, this.config.traffic.matchDistanceM);
      if (!edgeIds.length) {
        result.unmatched++;
        continue;
      }
      const names = candidates.filter((c) => edgeIds.includes(c.id) && c.name).map((c) => c.name!);
      hazards.push({ hazard, edgeIds, roadName: mostCommon(names) ?? hazard.feed.from });
    }

    const changes: IncidentChange[] = [];
    await this.db.transaction(async (tx) => {
      await this.scenarios.lock(tx, scenarioId);
      const seen = new Set<string>();
      for (const h of hazards.sort((a, b) => (a.hazard.externalId < b.hazard.externalId ? -1 : 1))) {
        const baseId = feedIncidentId(scenarioId, h.hazard.externalId);
        seen.add(baseId);
        const change = await this.upsert(tx, scenarioId, baseId, h, nowS);
        if (change) {
          changes.push(change.change);
          if (change.created) result.created++;
          else result.updated++;
        }
      }
      // Anything from the feed that is still open but no longer reported is cleared, unless an
      // operator verified it (then the operator owns it).
      const open = await tx
        .select()
        .from(incidents)
        .where(and(eq(incidents.scenarioId, scenarioId), eq(incidents.source, 'live_feed')));
      for (const r of open) {
        if (!isOpenStatus(r.status as Incident['status']) || r.status === 'verified') continue;
        if (seen.has(baseIdOf(r.id))) continue;
        const { seq: _seq, ...draft } = r;
        changes.push(
          await this.incidentsService.recordChange(tx, { ...draft, status: 'resolved', closedAtS: nowS, updatedAtS: nowS }, {
            kind: 'feed_cleared',
            actor: 'feed:tomtom',
            atS: nowS,
            payload: { externalId: (r.feed as FeedRef | null)?.externalId ?? null },
          }),
        );
        result.cleared++;
      }
    });
    this.incidentsService.publish(changes);

    const [{ n }] = (await this.db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM incidents
      WHERE scenario_id = ${scenarioId} AND source = 'live_feed' AND status IN ('unverified', 'corroborated', 'verified')`)) as unknown as [{ n: number }];
    this.status = { ...this.status, lastSuccessAtS: nowS, lastError: null, activeIncidents: n };
    this.logger.log(`TomTom poll: ${JSON.stringify(result)}`);
    return result;
  }

  /** Creates, updates or (if unchanged and fresh) leaves alone one feed incident. */
  private async upsert(
    tx: Tx,
    scenarioId: string,
    baseId: string,
    h: { hazard: FeedHazard; edgeIds: string[]; roadName: string | null },
    nowS: number,
  ): Promise<{ change: IncidentChange; created: boolean } | null> {
    const { hazard } = h;
    // The newest incident for this TomTom id: the base id, or a later one linked after a clear.
    const [existing] = await tx
      .select()
      .from(incidents)
      .where(and(eq(incidents.scenarioId, scenarioId), sql`(${incidents.id} = ${baseId} OR ${incidents.id} LIKE ${`${baseId}:r%`})`))
      .orderBy(sql`${incidents.createdAtS} DESC, ${incidents.id} DESC`)
      .limit(1);
    const feed: FeedRef = { ...hazard.feed, lastSeenAtS: nowS };
    const [lng, lat] = hazard.coordinates[Math.floor(hazard.coordinates.length / 2)]!;

    if (existing && isOpenStatus(existing.status as Incident['status'])) {
      const prev = existing.feed as FeedRef | null;
      const status = existing.status === 'verified' ? 'verified' : hazard.status;
      const changed =
        existing.type !== hazard.type ||
        existing.status !== status ||
        existing.congestion !== hazard.congestion ||
        existing.severity !== hazard.severity ||
        existing.impassable !== hazard.impassable ||
        [...existing.edgeIds].sort().join() !== h.edgeIds.join() ||
        prev?.magnitude !== feed.magnitude ||
        prev?.probability !== feed.probability;
      if (!changed && nowS - existing.lastReportAtS < FEED_REFRESH_S) return null;
      const { seq: _seq, ...draft } = existing;
      const next: IncidentDraft = {
        ...draft,
        type: hazard.type,
        status,
        congestion: hazard.congestion,
        severity: hazard.severity,
        impassable: hazard.impassable,
        edgeIds: h.edgeIds,
        roadName: h.roadName,
        lastReportAtS: nowS,
        updatedAtS: nowS,
        note: feed.description,
        feed,
      };
      return {
        change: await this.incidentsService.recordChange(tx, next, { kind: 'feed_updated', actor: 'feed:tomtom', atS: nowS, payload: { externalId: feed.externalId } }),
        created: false,
      };
    }
    // An operator dismissed this feed incident: do not bring it back while TomTom keeps reporting it.
    if (existing && existing.status === 'dismissed') return null;

    const id = existing ? `${baseId}:r${nowS}` : baseId;
    const draft: IncidentDraft = {
      id,
      scenarioId,
      type: hazard.type,
      status: hazard.status,
      source: 'live_feed',
      depth: null,
      congestion: hazard.congestion,
      severity: hazard.severity,
      concern: null,
      impassable: hazard.impassable,
      conflicting: false,
      edgeIds: h.edgeIds,
      roadName: h.roadName,
      reportCount: 0,
      deviceCount: 0,
      createdAtS: nowS,
      lastReportAtS: nowS,
      updatedAtS: nowS,
      verifiedAtS: null,
      audienceOnly: false,
      verifiedBy: null,
      closedAtS: null,
      linkedIncidentId: existing ? existing.id : null,
      note: feed.description,
      geom: [lng, lat],
      feed,
    };
    return {
      change: await this.incidentsService.recordChange(tx, draft, { kind: 'feed_created', actor: 'feed:tomtom', atS: nowS, payload: { externalId: feed.externalId } }),
      created: true,
    };
  }

  /** Bounding box of the scenario's road graph, padded by ~200 m. */
  private async bbox(graphVersion: string): Promise<Bbox> {
    const rows = await this.db.execute<{ minx: number; miny: number; maxx: number; maxy: number }>(sql`
      SELECT ST_XMin(e) AS minx, ST_YMin(e) AS miny, ST_XMax(e) AS maxx, ST_YMax(e) AS maxy
      FROM (SELECT ST_Extent(geom) AS e FROM road_edges WHERE graph_version = ${graphVersion}) x`);
    const r = rows[0];
    if (!r || r.minx === null) throw new ApiException('INTERNAL', `No road edges for graph ${graphVersion}`);
    const pad = 0.002;
    return { minLon: Number(r.minx) - pad, minLat: Number(r.miny) - pad, maxLon: Number(r.maxx) + pad, maxLat: Number(r.maxy) + pad };
  }

  /** Edges within the match distance of the feed geometry (PostGIS), with their coordinates. */
  private async candidates(graphVersion: string, coordinates: [number, number][]): Promise<CandidateEdge[]> {
    const geojson = JSON.stringify(
      coordinates.length === 1 ? { type: 'Point', coordinates: coordinates[0] } : { type: 'LineString', coordinates },
    );
    const rows = await this.db.execute<{ id: string; reverse_id: string | null; name: string | null; g: string }>(sql`
      SELECT id, reverse_id, name, ST_AsGeoJSON(geom) AS g FROM road_edges
      WHERE graph_version = ${graphVersion}
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)::geography, ${this.config.traffic.matchDistanceM})
      ORDER BY id`);
    return rows.map((r) => ({
      id: r.id,
      reverseId: r.reverse_id,
      name: r.name,
      coordinates: (JSON.parse(r.g) as { coordinates: [number, number][] }).coordinates,
    }));
  }
}

const baseIdOf = (id: string): string => id.replace(/:r\d+$/, '');

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of [...counts.entries()].sort()) if (c > n) [best, n] = [v, c];
  return best;
}

export type { IncidentRow };
