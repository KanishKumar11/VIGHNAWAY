import type { IncidentType, ScenarioEvent } from '@vighnaway/contracts';

/**
 * Simulation timeline (bottom of the console): the scripted events as ticks at their sim times,
 * clustered when they would collide, and the playhead position. Pure, so it is unit tested.
 */
export interface TimelineSpan {
  startS: number;
  endS: number;
}

export interface TimelineTick {
  id: string;
  atS: number;
  /** 0 to 100 along the track. */
  pct: number;
  kind: ScenarioEvent['kind'];
  /** Incident type for report ticks. */
  type: IncidentType | 'road_clear' | null;
  label: string;
}

export interface TickCluster {
  key: string;
  pct: number;
  atS: number;
  ticks: TimelineTick[];
}

/** Track from 0 to the last event plus a tail, rounded up to whole minutes. */
export function timelineSpan(events: readonly Pick<ScenarioEvent, 'atS'>[], tailS = 90): TimelineSpan {
  const last = events.reduce((m, e) => Math.max(m, e.atS), 0);
  return { startS: 0, endS: Math.max(60, Math.ceil((last + tailS) / 60) * 60) };
}

export const pctAt = (s: number, span: TimelineSpan): number =>
  Math.max(0, Math.min(100, ((s - span.startS) / Math.max(1, span.endS - span.startS)) * 100));

export function timelineTicks(events: readonly ScenarioEvent[], span: TimelineSpan): TimelineTick[] {
  return [...events]
    .sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : 1))
    .map((e) => ({
      id: e.id,
      atS: e.atS,
      pct: pctAt(e.atS, span),
      kind: e.kind,
      type: e.kind === 'report' ? e.report.type : null,
      label: e.label,
    }));
}

/**
 * Groups ticks closer than `minGapPct` into one cluster positioned at its first tick, so two
 * reports ten seconds apart read as one mark with two glyphs instead of overlapping.
 */
export function clusterTicks(ticks: readonly TimelineTick[], minGapPct: number): TickCluster[] {
  const out: TickCluster[] = [];
  for (const t of ticks) {
    const last = out[out.length - 1];
    if (last && t.pct - last.ticks[last.ticks.length - 1]!.pct < minGapPct) last.ticks.push(t);
    else out.push({ key: t.id, pct: t.pct, atS: t.atS, ticks: [t] });
  }
  return out;
}

/** Index of the last event that has happened at simTimeS (-1 before the first). */
export const passedCount = (ticks: readonly Pick<TimelineTick, 'atS'>[], simTimeS: number): number =>
  ticks.filter((t) => t.atS <= simTimeS).length;
