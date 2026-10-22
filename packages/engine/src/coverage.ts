import type { Incident, Text } from '@vighnaway/contracts';
import type { Graph } from './graph';
import { SCORING_RULES } from './rules';
import { durationText, tx } from './text/build';

/**
 * Evidence coverage: how recent the latest report is on each flood-prone road. It shows where the
 * control room is blind, not where the hazards are. "No reports" is not the same as "clear": a road
 * with no reports is unknown, and the data-gap rule already adds a small ranking cost for it while a
 * rain alert is active. Classes use the age thresholds the scoring rules already declare, so the
 * map, the brief and the ranking agree.
 */

export type CoverageClass = 'fresh' | 'ageing' | 'stale' | 'none';

export interface Observation {
  /** graph.json edge id. */
  edgeId: string;
  lastObservedAtS: number;
  kind?: 'hazard' | 'clear';
}

export interface RoadCoverage {
  /** Road name, or null for a flood-prone edge with no name. */
  name: string | null;
  class: CoverageClass;
  /** Newest observation on any edge of the road; null when none. */
  lastObservedAtS: number | null;
  /** Oldest of the per-edge newest observations among edges that have one; null when none. */
  oldestObservedAtS: number | null;
  /** Edges of the road with no observation at all. */
  unobservedEdges: number;
  /** graph.json edge ids of the road (both directions). */
  edgeIds: string[];
  text: Text;
}

/** Observations from the incidents the client holds (every status counts: a Resolved report was still a report). */
export function observationsFromIncidents(incidents: readonly Incident[]): Observation[] {
  return incidents.flatMap((inc) => inc.edgeIds.map((edgeId): Observation => ({ edgeId, lastObservedAtS: inc.lastReportAtS, kind: 'hazard' })));
}

/** Class for an observation `ageS` seconds old. Boundaries: 30 min is fresh, 3 h is ageing, more is stale. */
export function coverageClass(ageS: number | null): CoverageClass {
  if (ageS === null) return 'none';
  if (ageS <= SCORING_RULES.ageFactor.value.fullUntilS) return 'fresh';
  if (ageS <= SCORING_RULES.staleAfterS.value) return 'ageing';
  return 'stale';
}

function describe(name: string | null, cls: CoverageClass, ageS: number | null): Text {
  const road: Text | string = name ?? tx('place.floodProneRoad');
  if (cls === 'none' || ageS === null) return tx('cov.road.none', { road });
  if (cls === 'fresh') return tx('cov.road.fresh', { road });
  return tx(cls === 'ageing' ? 'cov.road.ageing' : 'cov.road.stale', { road, age: durationText(ageS) });
}

/** Every flood-prone road (edges grouped by name, twins together), worst coverage first, then by name. */
export function evidenceCoverage(graph: Graph, observations: readonly Observation[], nowS: number): RoadCoverage[] {
  const latest = new Map<string, number>();
  for (const o of observations) {
    const prev = latest.get(o.edgeId);
    if (prev === undefined || o.lastObservedAtS > prev) latest.set(o.edgeId, o.lastObservedAtS);
  }

  const roads = new Map<string, { name: string | null; edges: Set<string> }>();
  for (const e of graph.edges) {
    if (!e.floodProne || e.virtual) continue;
    const key = e.name ?? `edge:${e.baseId}`;
    let road = roads.get(key);
    if (!road) roads.set(key, (road = { name: e.name ?? null, edges: new Set() }));
    road.edges.add(e.baseId);
  }

  const order: Record<CoverageClass, number> = { none: 0, stale: 1, ageing: 2, fresh: 3 };
  const out: RoadCoverage[] = [];
  for (const road of roads.values()) {
    const edgeIds = [...road.edges].sort();
    const times = edgeIds.map((id) => latest.get(id)).filter((t): t is number => t !== undefined);
    const last = times.length ? Math.max(...times) : null;
    const oldest = times.length ? Math.min(...times) : null;
    const cls = coverageClass(last === null ? null : Math.max(0, nowS - last));
    out.push({
      name: road.name,
      class: cls,
      lastObservedAtS: last,
      oldestObservedAtS: oldest,
      unobservedEdges: edgeIds.length - times.length,
      edgeIds,
      text: describe(road.name, cls, last === null ? null : Math.max(0, nowS - last)),
    });
  }
  return out.sort((a, b) => order[a.class] - order[b.class] || ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0));
}

/** Roads with no report inside the data-gap window (60 min): the same window the ranking rule uses. */
export function roadsWithoutRecentReport(roads: readonly RoadCoverage[], nowS: number): RoadCoverage[] {
  const { windowS } = SCORING_RULES.dataGap.value;
  return roads.filter((r) => r.lastObservedAtS === null || nowS - r.lastObservedAtS > windowS);
}

/** "3 flood-prone roads have no report in the last hour". */
export function coverageBriefText(roads: readonly RoadCoverage[], nowS: number): Text {
  const gaps = roadsWithoutRecentReport(roads, nowS).length;
  if (roads.length === 0) return tx('cov.brief.noRoads');
  if (gaps === 0) return tx('cov.brief.none');
  return gaps === 1 ? tx('cov.brief.one') : tx('cov.brief.many', { n: gaps });
}
