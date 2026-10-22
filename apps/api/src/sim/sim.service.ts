import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ScenarioEvent, SimState } from '@vighnaway/contracts';
import { APP_CONFIG, type AppConfig } from '../config';
import { ApiException } from '../common/errors';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { incidentEvents, incidentReports, incidents, scenarios, simRuns } from '../db/schema';
import { IncidentsService } from '../incidents/incidents.service';
import { LiveService } from '../live/live.service';
import { ReportsService } from '../reports/reports.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { type ClockState, SimClockService, sortEvents } from '../scenarios/sim-clock.service';

export const runIdFor = (scenarioId: string, resetCount: number): string => `${scenarioId}:run:${resetCount}`;
export const scriptedReportId = (scenarioId: string, eventId: string): string => `${scenarioId}:rep:${eventId}`;
export const scriptedIncidentId = (scenarioId: string, eventId: string): string => `${scenarioId}:inc:${eventId}`;

/**
 * Simulation runner. While playing, simTimeS advances by simSecondsPerRealSecond each real
 * second; sim.tick goes out once per real second and due events (atS <= simTimeS) are applied in
 * order through the same ReportsService / IncidentsService methods real reports and operator
 * actions use, with the event's atS as server time.
 *
 * After the last event the clock keeps running (state stays 'playing', nextEventIndex ===
 * eventCount) so the phone's simulated vehicle can finish its trip; pausing (or stepping) once
 * every event is applied gives 'finished'. Play from 'finished' resumes the clock.
 *
 * All mutations of one scenario's clock are serialised on a promise queue.
 */
@Injectable()
export class SimService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('SimService');
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ScenariosService) private readonly scenarios: ScenariosService,
    @Inject(SimClockService) private readonly clock: SimClockService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(IncidentsService) private readonly incidents: IncidentsService,
    @Inject(LiveService) private readonly live: LiveService,
  ) {}

  /** A clock left 'playing' by a previous process comes back paused (no timer survived). */
  async onApplicationBootstrap(): Promise<void> {
    const rows = await this.db.select().from(scenarios);
    for (const row of rows) {
      const c = this.clock.fromRow(row);
      if (c.live) {
        // Live scenarios tick on wall time from boot; they have no events to apply.
        this.startTimer(c);
        continue;
      }
      if (c.state === 'playing') {
        c.state = c.nextEventIndex >= c.events.length ? 'finished' : 'paused';
        await this.persist(c);
      }
    }
  }

  onApplicationShutdown(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  private serial<T>(scenarioId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(scenarioId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(
      scenarioId,
      next.catch(() => undefined),
    );
    return next;
  }

  async state(scenarioId: string): Promise<SimState> {
    return this.clock.state(scenarioId);
  }

  play(scenarioId: string): Promise<SimState> {
    return this.serial(scenarioId, async () => {
      const c = await this.clock.get(scenarioId);
      this.rejectLive(c);
      if (c.state !== 'playing') {
        c.state = 'playing';
        c.playBaseSimS = c.simTimeS;
        c.playBaseWallMs = Date.now();
        this.startTimer(c);
        await this.persist(c);
        await this.db
          .update(simRuns)
          .set({ status: 'playing', startedWall: sql`coalesce(${simRuns.startedWall}, now())` })
          .where(eq(simRuns.id, c.runId));
      }
      return this.publishState(c);
    });
  }

  pause(scenarioId: string): Promise<SimState> {
    return this.serial(scenarioId, async () => {
      const c = await this.clock.get(scenarioId);
      this.rejectLive(c);
      this.stopTimer(scenarioId);
      // Freeze at the last published time, so pausing never applies events by itself.
      c.state = c.nextEventIndex >= c.events.length ? 'finished' : c.state === 'idle' ? 'idle' : 'paused';
      await this.persist(c);
      await this.setRunStatus(c);
      return this.publishState(c);
    });
  }

  /** Applies the next event (advancing the clock to its atS) and pauses. */
  step(scenarioId: string): Promise<SimState> {
    return this.serial(scenarioId, async () => {
      const c = await this.clock.get(scenarioId);
      this.rejectLive(c);
      this.stopTimer(scenarioId);
      const ev = c.events[c.nextEventIndex];
      if (ev) {
        c.simTimeS = Math.max(c.simTimeS, ev.atS);
        await this.applyEvent(c, ev);
        c.nextEventIndex += 1;
      }
      c.state = c.nextEventIndex >= c.events.length ? 'finished' : 'paused';
      await this.persist(c);
      await this.setRunStatus(c);
      return this.publishState(c);
    });
  }

  /**
   * Deletes the scenario's incidents, reports and events, bumps seq and sets reset_seq to it,
   * starts run `<scenario>:run:<reset_count>`, resets the clock and emits sim.reset.
   */
  reset(scenarioId: string): Promise<SimState> {
    return this.serial(scenarioId, async () => {
      const c = await this.clock.get(scenarioId);
      this.rejectLive(c);
      this.stopTimer(scenarioId);
      const oldRun = c.runId;
      const row = await this.db.transaction(async (tx) => {
        const locked = await this.scenarios.lock(tx, scenarioId);
        const nextRunId = runIdFor(scenarioId, locked.resetCount + 1);
        await tx.delete(incidentReports).where(eq(incidentReports.scenarioId, scenarioId));
        await tx.delete(incidents).where(eq(incidents.scenarioId, scenarioId));
        await tx.delete(incidentEvents).where(eq(incidentEvents.scenarioId, scenarioId));
        const [updated] = await tx
          .update(scenarios)
          .set({
            seq: sql`${scenarios.seq} + 1`,
            resetSeq: sql`${scenarios.seq} + 1`,
            resetCount: sql`${scenarios.resetCount} + 1`,
            runId: nextRunId,
            simState: 'idle',
            simTimeS: 0,
            nextEventIndex: 0,
            hospitalStates: {},
          })
          .where(eq(scenarios.id, scenarioId))
          .returning();
        await tx
          .update(simRuns)
          .set({ status: 'ended', endedWall: sql`now()` })
          .where(and(eq(simRuns.id, oldRun), eq(simRuns.scenarioId, scenarioId)));
        await tx
          .insert(simRuns)
          .values({ id: updated!.runId, scenarioId, status: 'idle' })
          .onConflictDoUpdate({
            target: simRuns.id,
            set: { status: 'idle', startedWall: null, endedWall: null, eventsApplied: 0 },
          });
        return updated!;
      });
      // Reload the clock (and the scenario definition: "reseed fixtures") from the reset row.
      const fresh = this.clock.fromRow(row);
      fresh.events = sortEvents(this.scenarios.definition(row).events);
      this.live.clearTrip(scenarioId);
      this.live.simReset({ scenarioId, runId: fresh.runId, seq: row.seq });
      return this.publishState(fresh, row.seq);
    });
  }

  private rejectLive(c: ClockState): void {
    if (c.live) throw new ApiException('CONFLICT', 'Live scenarios run on real time and have no simulation controls');
  }

  private startTimer(c: ClockState): void {
    this.stopTimer(c.scenarioId);
    const t = setInterval(() => {
      void this.serial(c.scenarioId, () => this.tick(c.scenarioId)).catch((err: unknown) =>
        this.logger.error(`tick failed: ${err instanceof Error ? err.stack : String(err)}`),
      );
    }, this.config.simTickMs);
    t.unref?.();
    this.timers.set(c.scenarioId, t);
  }

  private stopTimer(scenarioId: string): void {
    const t = this.timers.get(scenarioId);
    if (t) clearInterval(t);
    this.timers.delete(scenarioId);
  }

  private async tick(scenarioId: string): Promise<void> {
    const c = this.clock.peek(scenarioId);
    if (!c || c.state !== 'playing') return;
    if (c.live) {
      this.clock.refresh(c);
      this.live.simTick({ scenarioId, runId: c.runId, simTimeS: c.simTimeS });
      return;
    }
    const elapsedS = ((Date.now() - c.playBaseWallMs) / 1000) * (1000 / this.config.simTickMs);
    c.simTimeS = Math.max(c.simTimeS, c.playBaseSimS + Math.floor(elapsedS * c.speed + 1e-9));
    let applied = 0;
    while (c.nextEventIndex < c.events.length && c.events[c.nextEventIndex]!.atS <= c.simTimeS) {
      await this.applyEvent(c, c.events[c.nextEventIndex]!);
      c.nextEventIndex += 1;
      applied += 1;
    }
    await this.persist(c);
    this.live.simTick({ scenarioId, runId: c.runId, simTimeS: c.simTimeS });
    if (applied > 0) await this.publishState(c);
  }

  /** One scripted event through the same service methods as real reports and operator actions. */
  private async applyEvent(c: ClockState, ev: ScenarioEvent): Promise<void> {
    const sid = c.scenarioId;
    try {
      if (ev.kind === 'report') {
        await this.reports.submit(sid, ev.report, {
          nowS: ev.atS,
          source: 'simulated',
          reportId: scriptedReportId(sid, ev.id),
          newIncidentId: scriptedIncidentId(sid, ev.id),
          eventId: ev.id,
          ip: null,
        });
      } else {
        const incidentId = await this.incidents.incidentForEvent(sid, ev.targetEventId);
        if (!incidentId) {
          this.logger.warn(`event ${ev.id}: no incident for target ${ev.targetEventId}; skipped`);
        } else {
          await this.incidents.operatorAction(sid, incidentId, ev.kind, {
            nowS: ev.atS,
            actor: 'simulated_operator',
            eventId: ev.id,
          });
        }
      }
    } catch (err) {
      if (err instanceof ApiException) {
        this.logger.warn(`event ${ev.id} not applied: ${err.code} ${err.message}`);
      } else {
        throw err;
      }
    }
    await this.db
      .update(simRuns)
      .set({ eventsApplied: sql`${simRuns.eventsApplied} + 1` })
      .where(eq(simRuns.id, c.runId));
  }

  private async persist(c: ClockState): Promise<void> {
    await this.db
      .update(scenarios)
      .set({ simState: c.state, simTimeS: c.simTimeS, nextEventIndex: c.nextEventIndex })
      .where(and(eq(scenarios.id, c.scenarioId), eq(scenarios.runId, c.runId)));
  }

  private async setRunStatus(c: ClockState): Promise<void> {
    await this.db.update(simRuns).set({ status: c.state }).where(eq(simRuns.id, c.runId));
  }

  private async publishState(c: ClockState, knownSeq?: number): Promise<SimState> {
    const seq = knownSeq ?? (await this.scenarios.requireRow(c.scenarioId)).seq;
    const state = this.clock.toState(c, seq);
    this.live.simState(state);
    return state;
  }
}
