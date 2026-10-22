import { Inject, Injectable } from '@nestjs/common';
import type { ScenarioEvent, SimPlayState, SimState } from '@vighnaway/contracts';
import type { ScenarioRow } from '../db/schema';
import { ScenariosService } from './scenarios.service';

/** In-memory clock of one scenario. The scenarios row holds a persisted copy. */
export interface ClockState {
  scenarioId: string;
  runId: string;
  state: SimPlayState;
  /** Simulation time last published (sim.tick / sim.state). Real reports get this time. */
  simTimeS: number;
  nextEventIndex: number;
  speed: number;
  events: ScenarioEvent[];
  /** While playing: simTimeS at play start and the wall time it started (ms). */
  playBaseSimS: number;
  playBaseWallMs: number;
  /** Live scenarios run on wall time (seconds since clockStartsAt) and have no events. */
  live: boolean;
  liveEpochMs: number;
}

/** Wall-clock seconds since a live scenario's clockStartsAt. */
export const liveSeconds = (epochMs: number, nowMs = Date.now()): number => Math.max(0, Math.floor((nowMs - epochMs) / 1000));

export const sortEvents = (events: readonly ScenarioEvent[]): ScenarioEvent[] =>
  [...events].sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * Holds every scenario's simulation clock. SimService drives it (play, pause, step, reset,
 * ticks); everything else only reads it, so reports get server time without depending on the
 * runner.
 */
@Injectable()
export class SimClockService {
  private readonly clocks = new Map<string, ClockState>();

  constructor(@Inject(ScenariosService) private readonly scenarios: ScenariosService) {}

  fromRow(row: ScenarioRow): ClockState {
    const def = this.scenarios.definition(row);
    const live = def.mode === 'live';
    const liveEpochMs = Date.parse(def.clockStartsAt);
    const state = live ? 'playing' : (row.simState as SimPlayState);
    const c: ClockState = {
      scenarioId: row.id,
      runId: row.runId,
      state,
      simTimeS: live ? liveSeconds(liveEpochMs) : row.simTimeS,
      nextEventIndex: live ? 0 : row.nextEventIndex,
      speed: def.simSecondsPerRealSecond,
      events: live ? [] : sortEvents(def.events),
      playBaseSimS: row.simTimeS,
      playBaseWallMs: Date.now(),
      live,
      liveEpochMs,
    };
    this.clocks.set(row.id, c);
    return c;
  }

  peek(scenarioId: string): ClockState | undefined {
    return this.clocks.get(scenarioId);
  }

  /** Loads the clock from the database the first time a scenario is touched. */
  async get(scenarioId: string): Promise<ClockState> {
    const c = this.clocks.get(scenarioId);
    if (c) return c;
    const row = await this.scenarios.requireRow(scenarioId);
    return this.clocks.get(scenarioId) ?? this.fromRow(row);
  }

  all(): ClockState[] {
    return [...this.clocks.values()];
  }

  /** Live clocks follow the wall clock; simulated clocks only move when the runner moves them. */
  refresh(c: ClockState): ClockState {
    if (c.live) c.simTimeS = liveSeconds(c.liveEpochMs);
    return c;
  }

  /** Server time for a real (non-scripted) report: the current simulation (or live) time. */
  async nowS(scenarioId: string): Promise<number> {
    return this.refresh(await this.get(scenarioId)).simTimeS;
  }

  async state(scenarioId: string): Promise<SimState> {
    const c = this.refresh(await this.get(scenarioId));
    const row = await this.scenarios.requireRow(scenarioId);
    return this.toState(c, row.seq);
  }

  toState(c: ClockState, seq: number): SimState {
    return {
      scenarioId: c.scenarioId,
      runId: c.runId,
      state: c.state,
      simTimeS: c.simTimeS,
      nextEventIndex: c.nextEventIndex,
      eventCount: c.events.length,
      simSecondsPerRealSecond: c.speed,
      seq,
    };
  }
}
