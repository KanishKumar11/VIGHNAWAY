import type { LatLng, PlanResult } from '@vighnaway/contracts';
import type { Graph } from './graph';
import { edgeCumulative } from './graph';
import { pointAlong } from './geo';

/**
 * "Ask the crowd at data gaps". A flood-prone road with no report in the last hour while a rain
 * alert is active already costs a small ranking penalty and lowers confidence (the data-gap rule).
 * These are the same roads, as questions a phone can put to the person nearby: "Is <road> flooded
 * right now?". Pure and derived from the plan; it decides nothing. An answer is an ordinary report
 * with an ordinary status (never auto-Verified).
 */
export interface DataGapQuestion {
  /** Stable per road: the road name, or the edge id for an unnamed road. */
  key: string;
  roadName: string | null;
  /** Route edge (profile edge id) the gap was found on. */
  edgeId: string;
  /** Where to file the report: the middle of that edge. */
  point: LatLng;
  /** Distance along the recommended route, metres. */
  positionM: number;
}

/** One question per data-gap road on the recommended route, in route order. */
export function dataGapQuestions(plan: PlanResult, graph: Graph): DataGapQuestion[] {
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  if (!rec) return [];
  const seen = new Set<string>();
  const out: DataGapQuestion[] = [];
  for (const gap of [...rec.dataGaps].sort((a, b) => a.positionM - b.positionM)) {
    const key = gap.roadName ?? gap.edgeId;
    if (seen.has(key)) continue;
    const ei = graph.edgeIndex.get(gap.edgeId);
    if (ei === undefined) continue;
    seen.add(key);
    const e = graph.edges[ei]!;
    out.push({ key, roadName: gap.roadName, edgeId: gap.edgeId, point: pointAlong(e.geometry, edgeCumulative(e), 0.5).point, positionM: gap.positionM });
  }
  return out;
}

/** At most one prompt per road per device per 30 minutes. */
export const ASK_COOLDOWN_MS = 30 * 60 * 1000;

export interface AskState {
  /** Wall-clock time each road was last asked about (or answered), by `DataGapQuestion.key`. */
  askedAtMs: Readonly<Record<string, number>>;
  nowMs: number;
  /** True while the traveller is moving faster than walking pace: never ask then. */
  movingFasterThanWalking: boolean;
}

/** The first question that may be asked now, or null. Deterministic. */
export function nextQuestion(questions: readonly DataGapQuestion[], state: AskState): DataGapQuestion | null {
  if (state.movingFasterThanWalking) return null;
  return questions.find((q) => !(q.key in state.askedAtMs) || state.nowMs - state.askedAtMs[q.key]! >= ASK_COOLDOWN_MS) ?? null;
}
