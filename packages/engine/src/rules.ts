import type { CongestionLevel, IncidentStatus, Profile, Severity } from '@vighnaway/contracts';

/**
 * SCORING_RULES is the single source of every routing constant. docs/scoring.md is generated
 * from it (pnpm docs:scoring), and the console /rules page and the app's How it decides screen
 * render it, so documentation never drifts from code. Change a value only with that doc.
 */

export interface RuleEntry<T> {
  value: T;
  description: string;
}

const r = <T>(value: T, description: string): RuleEntry<T> => ({ value, description });

/** Speeds in km/h per road class: illustrative monsoon-traffic defaults, not measurements. */
const CAR_SPEEDS: Record<string, number> = {
  motorway: 50,
  motorway_link: 35,
  trunk: 40,
  trunk_link: 30,
  primary: 30,
  primary_link: 25,
  secondary: 25,
  secondary_link: 20,
  tertiary: 20,
  tertiary_link: 18,
  unclassified: 15,
  residential: 15,
  living_street: 10,
  service: 10,
  road: 15,
};

const TWO_WHEELER_SPEEDS: Record<string, number> = {
  motorway: 50,
  motorway_link: 35,
  trunk: 40,
  trunk_link: 32,
  primary: 32,
  primary_link: 27,
  secondary: 27,
  secondary_link: 22,
  tertiary: 22,
  tertiary_link: 20,
  unclassified: 18,
  residential: 18,
  living_street: 12,
  service: 12,
  road: 18,
};

export const SCORING_RULES = {
  version: 1,
  formula:
    'C(r) = sum over edges of (travel time x congestion multiplier) + sum over incidents on the route of (severity penalty x verification weight x age factor) + data-gap penalty',
  congestionMultiplier: r<Record<CongestionLevel | 'none', number>>(
    { none: 1.0, moderate: 1.5, heavy: 2.5, standstill: 4.0 },
    'Verified or corroborated congestion multiplies edge travel time, so the displayed ETA changes.',
  ),
  unverifiedCongestionWeight: r(
    0.4,
    'Unverified congestion adds a ranking penalty equal to the extra time it would add x 0.4. The displayed ETA does not change.',
  ),
  severityPenaltyS: r<Record<Severity, number>>(
    { low: 60, medium: 300, high: 900 },
    'Ranking-only seconds for debris and accidents (and medium for ankle-deep water). Never shown as time.',
  ),
  defaultSeverity: r<Severity>('medium', 'Severity assumed when a debris or accident report gives none.'),
  verificationWeight: r<Record<IncidentStatus, number>>(
    { verified: 1.0, corroborated: 0.75, unverified: 0.4, resolved: 0, dismissed: 0 },
    'Scales the severity penalty by how well the incident is supported.',
  ),
  ageFactor: r(
    { fullUntilS: 30 * 60, floor: 0.6, floorAtS: 3 * 3600 },
    'Penalty weight is 1.0 for reports under 30 min old, falling linearly to 0.6 at 3 h, and 0.6 after that. Older reports are labelled Stale, never dropped.',
  ),
  staleAfterS: r(
    3 * 3600,
    'A report older than 3 simulated hours (strictly more than 10,800 s) is labelled Stale. Hard blocks from stale reports stay in force until an operator resolves them, and confidence drops to Low.',
  ),
  unverifiedBlockPenaltyS: r(
    1800,
    'An unverified closure, unverified knee-or-deeper flood, or unverified impassable report adds 1,800 s to ranking and a visible warning; the route stays viable.',
  ),
  ankleFloodSeverity: r<Severity>(
    'medium',
    'Ankle-deep water is a medium-severity penalty (300 s x weight x age) for every open status; the route stays viable.',
  ),
  defaultFloodDepth: r(
    'knee' as const,
    'A flood report with no depth is treated as knee depth (conservative).',
  ),
  dataGap: r(
    { penaltyS: 120, windowS: 60 * 60 },
    'While a rain alert is active, each flood-prone edge with no report in the last 60 simulated minutes adds 120 s to ranking only. A report exactly 60 min old still counts as recent. It never creates an incident and is shown as "No recent reports on <road>".',
  ),
  switching: r(
    { minGainS: 120, minGainFraction: 0.1 },
    'Keep the current recommendation unless it is not viable, or another viable route is cheaper by more than the larger of 120 s and 10% of the current cost. A gain exactly equal to the threshold does not switch.',
  ),
  tieBreak: r(
    ['cost', 'distance', 'routeId'] as const,
    'Ties are broken by lower cost, then shorter distance, then the lexicographically smaller route id. Costs and ETAs are rounded to whole seconds before comparing.',
  ),
  confidence: r(
    {
      lowGapS: 60,
      mediumGapS: 180,
    },
    'Low: a conflicting incident on the route, viability relying on a stale report, the next viable route within 60 s of ranking cost, or a forced reversal. Medium: an unverified incident on the route, a data gap on the route, no alert information while the route uses flood-prone edges, or the next viable route within 60 to 180 s. High otherwise, including when no other viable route exists.',
  ),
  candidates: r(
    { k: 5, overlapLimit: 0.8, penaltyRounds: 4, penaltyFactor: 1.6, maxDisplayed: 4 },
    'Candidates come from Yen k-shortest paths (k = 5) plus edge-penalty alternatives and the best path around current hazards. A candidate sharing more than 80% of its length with a better one is dropped. Up to 4 routes are shown.',
  ),
  reversal: r(
    'Turn back only where it is safe to do so',
    'Re-planning never turns back onto the current edge while any forward plan is viable. Only when none is viable may it return a reversal, with this label and confidence Low.',
  ),
  speedsKmh: r<Record<Profile, Record<string, number>>>(
    {
      car: CAR_SPEEDS,
      two_wheeler: TWO_WHEELER_SPEEDS,
      foot: { default: 4.5, steps: 3.0 },
    },
    'Illustrative monsoon-traffic speeds per road class, in km/h. Not measurements.',
  ),
  defaultSpeedKmh: r<Record<Profile, number>>(
    { car: 15, two_wheeler: 18, foot: 4.5 },
    'Speed for road classes not listed above.',
  ),
  access: r(
    {
      motorExcludedHighways: [
        'footway',
        'path',
        'pedestrian',
        'steps',
        'cycleway',
        'bridleway',
        'corridor',
        'platform',
        'elevator',
      ],
      footExcludedHighways: ['motorway', 'motorway_link'],
    },
    'Car and two-wheeler exclude footways, paths, pedestrian streets, steps and motor_vehicle=no. On foot excludes foot=no and motorways, includes footways, footbridges and steps, and may walk one-way streets in both directions. access=no or private excludes every profile unless the profile tag says yes.',
  ),
} as const;

export type ScoringRules = typeof SCORING_RULES;

/** Plain list for rendering on the rules screens. */
export function scoringRulesTable(): { key: string; value: string; description: string }[] {
  const out: { key: string; value: string; description: string }[] = [];
  for (const [key, entry] of Object.entries(SCORING_RULES)) {
    if (typeof entry === 'object' && entry !== null && 'description' in entry) {
      const e = entry as RuleEntry<unknown>;
      out.push({ key, value: stringifyRuleValue(e.value), description: e.description });
    }
  }
  return out;
}

function stringifyRuleValue(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .map((k) => {
        const inner = (v as Record<string, unknown>)[k];
        return `${k}: ${typeof inner === 'object' ? stringifyRuleValue(inner) : String(inner)}`;
      })
      .join('; ');
  }
  return String(v);
}
