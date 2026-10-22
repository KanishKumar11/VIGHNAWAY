import type { HistoryEntry, Incident } from '@vighnaway/contracts';
import { incidentsAtSeq } from '@vighnaway/contracts';
import { createTrip, incidentsTrip, tickTrip, type TripEnv, type TripState } from './demoTrip';

/**
 * Decision replay (console timeline). The engine is deterministic, so the decision at any past
 * moment is rebuilt by feeding the run's incident history, in order, through the same trip
 * controller steps the live console uses: plan from the start, then re-plan at every change.
 * Read-only: nothing here talks to the server.
 */
export interface ReplayView {
  trip: TripState;
  incidents: Incident[];
  atS: number;
  seq: number;
}

/** The last history seq at or before `atS` (0 before the first change). */
export function seqAtTime(entries: readonly HistoryEntry[], atS: number): number {
  let seq = 0;
  for (const e of entries) {
    if (e.atS > atS) break;
    seq = e.seq;
  }
  return seq;
}

/** Distinct moments the history changed, oldest first (the timeline's decision markers). */
export function replayMoments(entries: readonly HistoryEntry[]): { seq: number; atS: number }[] {
  const out: { seq: number; atS: number }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.atS === e.atS) last.seq = e.seq;
    else out.push({ seq: e.seq, atS: e.atS });
  }
  return out;
}

/** The trip as the console decided it at `atS`, from the history up to `seq`. */
export function replayTrip(env: TripEnv, entries: readonly HistoryEntry[], atS: number): ReplayView {
  const seq = seqAtTime(entries, atS);
  let trip = createTrip(env, [], 0);
  let incidents: Incident[] = [];
  for (const m of replayMoments(entries)) {
    if (m.seq > seq) break;
    trip = tickTrip(env, trip, m.atS, incidents);
    incidents = incidentsAtSeq(entries, m.seq);
    trip = incidentsTrip(env, trip, incidents, m.atS);
  }
  if (atS > trip.simTimeS) trip = tickTrip(env, trip, atS, incidents);
  return { trip, incidents, atS, seq };
}
