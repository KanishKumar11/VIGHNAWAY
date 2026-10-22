import type { Alert, Incident } from '@vighnaway/contracts';
import { isOpenStatus } from '@vighnaway/contracts';
import { SCORING_RULES } from './rules';

/** The walking-concern reports a "Prefer well-lit roads" plan ranks against (plain data, so the plan memo can hash it). */
export interface LightingContext {
  concerns: Array<{ id: string; edgeIds: string[]; status: Incident['status']; lastReportAtS: number }>;
}

export interface EvalContext {
  /** Simulation time, seconds. The engine never reads a clock. */
  nowS: number;
  /** A rain alert is active at nowS. */
  rainAlertActive: boolean;
  /** False when the scenario has no alert information at all. */
  hasAlertInformation: boolean;
  /** Present only when the traveller turned on "Prefer well-lit roads" for a walking plan (P2-9). */
  lighting?: LightingContext;
}

export function alertContext(
  alerts: readonly Alert[],
  hasAlertInformation: boolean,
  nowS: number,
): EvalContext {
  const rainAlertActive =
    hasAlertInformation &&
    alerts.some(
      (a) => a.kind === 'rain' && a.activeFromS <= nowS && (a.activeUntilS === null || nowS < a.activeUntilS),
    );
  return { nowS, rainAlertActive, hasAlertInformation };
}

export interface IncidentIndex {
  /** Every incident, sorted by id. */
  sorted: Incident[];
  byId: Map<string, Incident>;
  /** Open incidents per graph.json edge id, sorted by incident id. */
  openByEdge: Map<string, Incident[]>;
  /** Latest report time per graph.json edge id, from incidents of any status (data-gap coverage). */
  lastReportByEdge: Map<string, number>;
  /** Stable fingerprint of the incident set, for memoisation. */
  fingerprint: string;
}

const byId = (a: Incident, b: Incident) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildIncidentIndex(incidents: readonly Incident[]): IncidentIndex {
  // Walking concerns (P2-8) are display only: they never reach routing, data-gap coverage or the incident count.
  const sorted = incidents.filter((i) => i.type !== 'walking_concern').sort(byId);
  const map = new Map<string, Incident>();
  const openByEdge = new Map<string, Incident[]>();
  const lastReportByEdge = new Map<string, number>();
  const parts: string[] = [];
  for (const inc of sorted) {
    map.set(inc.id, inc);
    parts.push(
      `${inc.id}:${inc.seq}:${inc.status}:${inc.depth}:${inc.congestion}:${inc.severity}:${inc.impassable ? 1 : 0}:${inc.conflicting ? 1 : 0}:${inc.lastReportAtS}:${[...inc.edgeIds].sort().join(',')}`,
    );
    const edges = [...inc.edgeIds].sort();
    for (const edgeId of edges) {
      const prev = lastReportByEdge.get(edgeId);
      if (prev === undefined || inc.lastReportAtS > prev) lastReportByEdge.set(edgeId, inc.lastReportAtS);
      if (!isOpenStatus(inc.status)) continue;
      const list = openByEdge.get(edgeId);
      if (list) list.push(inc);
      else openByEdge.set(edgeId, [inc]);
    }
  }
  return { sorted, byId: map, openByEdge, lastReportByEdge, fingerprint: parts.join(';') };
}

export type EffectKind = 'block' | 'warning' | 'penalty' | 'congestion' | 'none';

export interface IncidentEffect {
  kind: EffectKind;
  /** Ranking-only penalty for the incident as a whole (not congestion), unrounded. */
  penaltyS: number;
  /** Travel-time multiplier for verified or corroborated congestion; 1 otherwise. */
  multiplier: number;
  /** Unverified congestion: share of the extra time added to ranking (0 otherwise). */
  unverifiedCongestionShare: number;
  ageS: number;
  stale: boolean;
  /** Short machine reason, e.g. "flood_depth", "closure", "impassable". */
  reason: string;
}

export function ageFactor(ageS: number): number {
  const { fullUntilS, floor, floorAtS } = SCORING_RULES.ageFactor.value;
  if (ageS <= fullUntilS) return 1;
  if (ageS >= floorAtS) return floor;
  return 1 - ((1 - floor) * (ageS - fullUntilS)) / (floorAtS - fullUntilS);
}

export const isStale = (ageS: number): boolean => ageS > SCORING_RULES.staleAfterS.value;

/** Hard evidence: verified or corroborated. */
export const isHard = (i: Incident): boolean => i.status === 'verified' || i.status === 'corroborated';

/** Applies the Scoring definitions table to one incident. */
export function incidentEffect(inc: Incident, ctx: EvalContext): IncidentEffect {
  const ageS = Math.max(0, ctx.nowS - inc.lastReportAtS);
  const stale = isStale(ageS);
  const none: IncidentEffect = {
    kind: 'none',
    penaltyS: 0,
    multiplier: 1,
    unverifiedCongestionShare: 0,
    ageS,
    stale,
    reason: 'closed',
  };
  if (!isOpenStatus(inc.status)) return none;
  const w = SCORING_RULES.verificationWeight.value[inc.status];
  const f = ageFactor(ageS);
  const hard = isHard(inc);
  const warnS = SCORING_RULES.unverifiedBlockPenaltyS.value;
  const sev = SCORING_RULES.severityPenaltyS.value;

  switch (inc.type) {
    case 'flood': {
      const depth = inc.depth ?? SCORING_RULES.defaultFloodDepth.value;
      if (depth === 'ankle') {
        return { ...none, kind: 'penalty', penaltyS: sev[SCORING_RULES.ankleFloodSeverity.value] * w * f, reason: 'shallow_water' };
      }
      if (hard) return { ...none, kind: 'block', reason: 'flood_depth' };
      return { ...none, kind: 'warning', penaltyS: warnS, reason: 'flood_depth_unverified' };
    }
    case 'closure':
      if (hard) return { ...none, kind: 'block', reason: 'closure' };
      return { ...none, kind: 'warning', penaltyS: warnS, reason: 'closure_unverified' };
    case 'congestion': {
      const level = inc.congestion ?? 'moderate';
      const m = SCORING_RULES.congestionMultiplier.value[level];
      if (hard) return { ...none, kind: 'congestion', multiplier: m, reason: 'congestion' };
      return {
        ...none,
        kind: 'penalty',
        unverifiedCongestionShare: (m - 1) * SCORING_RULES.unverifiedCongestionWeight.value,
        reason: 'congestion_unverified',
      };
    }
    case 'walking_concern':
      return { ...none, reason: 'display_only' };
    case 'debris':
    case 'accident': {
      const p = sev[inc.severity ?? SCORING_RULES.defaultSeverity.value] * w * f;
      if (inc.impassable && hard) return { ...none, kind: 'block', reason: 'impassable' };
      if (inc.impassable) return { ...none, kind: 'warning', penaltyS: p + warnS, reason: 'impassable_unverified' };
      return { ...none, kind: 'penalty', penaltyS: p, reason: inc.type };
    }
  }
}

/** The lighting context for a plan: only when the preference is on and the profile is walking. */
export function lightingContext(
  graph: { profile: string },
  opts: { preferLit?: boolean; walkingConcerns?: readonly Incident[] },
): LightingContext | undefined {
  if (!opts.preferLit || graph.profile !== 'foot') return undefined;
  const concerns = (opts.walkingConcerns ?? [])
    .filter((i) => i.type === 'walking_concern' && isOpenStatus(i.status))
    .map((i) => ({ id: i.id, edgeIds: [...i.edgeIds].sort(), status: i.status, lastReportAtS: i.lastReportAtS }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { concerns };
}
