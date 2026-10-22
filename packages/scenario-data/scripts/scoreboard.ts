/**
 * Scenario scoreboard (P1-6): replays a published set of seeded, simulated monsoon scenarios on the
 * real Andheri graph and reports what the engine recommends as evidence arrives, compared with the
 * usual fastest route. Run: pnpm scoreboard (writes docs/scoreboard.md and docs/scoreboard.json).
 *
 * Seeded randomness lives only in this generator, never in packages/engine: the same seeds give a
 * byte-identical report. Every figure is "Simulated scenarios on real roads; modelled minutes".
 * A hard block makes "the route avoids it" true by construction, so avoidance is not reported as a
 * result; the report gives the usual route's exposure and the cost of avoiding it.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GraphFile, Incident, IncidentType, PlanResult, Scenario } from '@vighnaway/contracts';
import { loadGraph, planTrip, SCORING_RULES, type Graph } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '../src/index';

/** Published starting points (OSM node ids on the real graph) and the three hospitals of the scenario. */
export const ORIGINS: ReadonlyArray<{ id: string; node: string }> = [
  { id: 'Ramesh Nagar, Andheri West', node: '1936580491' },
  { id: 'Marol Naka, Andheri East', node: '14019451450' },
  { id: 'Veera Desai Road, Andheri West', node: '1936580520' },
  { id: 'Sahakar Road, Andheri West', node: '13573752989' },
  { id: 'Dadabhai Cross Road, Andheri West', node: '1936295880' },
  { id: 'Gulmohar Cross Road, Juhu', node: '13459718805' },
  { id: 'M C Chagla Road, Andheri East', node: '245670602' },
  { id: 'Guru Hargovindji Road, Andheri East', node: '6430365488' },
  { id: 'Jai Prakash Road, Andheri West', node: '13437459454' },
  { id: 'Swami Vivekanand Road, Andheri West', node: '13589430204' },
];
export const HOSPITAL_IDS = ['hosp-kokilaben', 'hosp-hbt', 'hosp-holy-spirit'] as const;

/** The default published set: seeds 1 to 20. */
export const DEFAULT_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

export type Prng = () => number;
/** mulberry32: a small, well-known seeded generator. Deterministic across platforms (integer maths). */
export function prng(seed: number): Prng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Step {
  atS: number;
  /** The incidents as they stand at this moment. */
  incidents: Incident[];
}

export interface ScoreScenario {
  seed: number;
  originName: string;
  originNode: string;
  destinationId: string;
  destinationName: string;
  destinationNode: string;
  steps: Step[];
}

const pick = <T>(r: Prng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const between = (r: Prng, lo: number, hi: number, step = 10): number => lo + step * Math.floor((r() * (hi - lo)) / step);

function chooseTrip(r: Prng, graph: Graph, scenario: Scenario) {
  for (let tries = 0; tries < 50; tries++) {
    const origin = pick(r, ORIGINS);
    const hospId = pick(r, HOSPITAL_IDS);
    const hosp = scenario.places.find((p) => p.id === hospId)!;
    if (origin.node === hosp.nodeId) continue;
    const plan = planTrip({ graph, origin: origin.node, destination: hosp.nodeId, incidents: [], nowS: 0, alerts: scenario.alerts, hasAlertInformation: true });
    if (plan.routes.length >= 2) return { origin, hosp, plan };
  }
  throw new Error('no usable trip for this seed');
}

const TYPES: ReadonlyArray<readonly [IncidentType, number]> = [
  ['flood', 0.4],
  ['congestion', 0.25],
  ['closure', 0.15],
  ['debris', 0.1],
  ['accident', 0.1],
];

function incidentOn(r: Prng, graph: Graph, edgeIdx: readonly number[], type: IncidentType, index: number, atS: number): Incident {
  // Extent as the API gives it: the snapped edge, its twin and along the road for 60 m (600 m for congestion).
  const start = Math.floor(r() * edgeIdx.length);
  const ids = new Set<string>();
  let reach = 0;
  const limit = type === 'congestion' ? 600 : 60;
  for (let i = start; i < edgeIdx.length && (reach === 0 || reach < limit) && ids.size < 8; i++) {
    const e = graph.edges[edgeIdx[i]!]!;
    ids.add(e.baseId);
    if (e.reverseIdx >= 0) ids.add(graph.edges[e.reverseIdx]!.baseId);
    reach += e.lengthM;
  }
  const first = graph.edges[edgeIdx[start]!]!;
  const mid = first.geometry[Math.floor(first.geometry.length / 2)]!;
  const depth = type === 'flood' ? pick(r, ['ankle', 'knee', 'waist'] as const) : null;
  const congestion = type === 'congestion' ? pick(r, ['moderate', 'heavy', 'standstill'] as const) : null;
  const severity = type === 'debris' || type === 'accident' ? pick(r, ['low', 'medium', 'high'] as const) : null;
  return {
    id: `sb:inc:${index}`,
    scenarioId: 'scoreboard',
    type,
    status: 'unverified',
    source: 'simulated',
    depth,
    congestion,
    severity,
    impassable: type === 'closure' ? true : (type === 'debris' || type === 'accident') && r() < 0.3,
    conflicting: false,
    edgeIds: [...ids].sort(),
    point: { lat: mid[1], lng: mid[0] },
    roadName: first.name,
    reportCount: 1,
    deviceCount: 1,
    createdAtS: atS,
    lastReportAtS: atS,
    updatedAtS: atS,
    verifiedAtS: null,
    verifiedBy: null,
    closedAtS: null,
    linkedIncidentId: null,
    note: null,
    seq: 0,
  };
}

/** One scenario from one seed. Pure and deterministic. */
export function generateScenario(seed: number, graph: Graph, scenario: Scenario = andheriScenario): ScoreScenario {
  const r = prng(seed);
  const { origin, hosp, plan } = chooseTrip(r, graph, scenario);
  const usual = plan.routes.find((x) => x.routeId === plan.usualFastestRouteId) ?? plan.routes[0]!;
  const pool = plan.routes.map((x) => x.edgeIds.map((id) => graph.edgeIndex.get(id)!).filter((i) => !graph.edges[i]!.virtual));
  const usualPool = pool[plan.routes.indexOf(usual)]!;

  const count = 1 + Math.floor(r() * 4);
  const events: Array<{ atS: number; apply: (m: Map<string, Incident>) => void }> = [];
  for (let n = 0; n < count; n++) {
    // 60% of hazards fall on the usual fastest route, the rest on another candidate (or anywhere on it).
    const edges = r() < 0.6 ? usualPool : pool[Math.floor(r() * pool.length)]!;
    if (!edges.length) continue;
    const roll = r();
    let acc = 0;
    const type = TYPES.find(([, p]) => (acc += p) > roll)?.[0] ?? 'flood';
    const t0 = between(r, 60, 1200);
    const base = incidentOn(r, graph, edges, type, n, t0);
    events.push({ atS: t0, apply: (m) => m.set(base.id, base) });
    let t = t0;
    if (r() < 0.5) {
      t += between(r, 10, 300);
      const at = t;
      events.push({ atS: at, apply: (m) => m.set(base.id, { ...m.get(base.id)!, status: 'corroborated', reportCount: 2, deviceCount: 2, lastReportAtS: at, updatedAtS: at }) });
    }
    if (r() < 0.35) {
      t += between(r, 30, 600);
      const at = t;
      events.push({ atS: at, apply: (m) => m.set(base.id, { ...m.get(base.id)!, status: 'verified', verifiedAtS: at, verifiedBy: 'simulated_operator', lastReportAtS: at, updatedAtS: at }) });
      if (r() < 0.2) {
        t += between(r, 300, 600);
        const rt = t;
        events.push({ atS: rt, apply: (m) => m.set(base.id, { ...m.get(base.id)!, status: 'resolved', closedAtS: rt, updatedAtS: rt }) });
      }
    }
  }
  // Stable order: by time, then by the order generated.
  const ordered = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.atS - b.atS || a.i - b.i);
  const state = new Map<string, Incident>();
  const steps: Step[] = [{ atS: 0, incidents: [] }];
  for (const e of ordered) {
    e.apply(state);
    steps.push({ atS: e.atS, incidents: [...state.values()].map((x) => ({ ...x })) });
  }
  return { seed, originName: origin.id, originNode: origin.node, destinationId: hosp.id, destinationName: hosp.name, destinationNode: hosp.nodeId, steps };
}

export interface ScenarioResult {
  seed: number;
  origin: string;
  destination: string;
  incidents: number;
  steps: number;
  usualEtaMin: number;
  /** The usual fastest route crosses a Verified or Corroborated hard block at the end. */
  usualBlocked: boolean;
  /** The usual fastest route crosses any open reported hazard at the end. */
  usualExposed: boolean;
  /** Modelled minutes the final recommendation takes beyond the usual route's own modelled time (0 if it is not slower). */
  extraMin: number;
  /** Largest of that figure at any step. */
  worstExtraMin: number;
  changes: number;
  noViable: boolean;
  /** Final recommendation is more than a minute slower and no hard block stands on the usual route. */
  slowerNoBlock: boolean;
  note: string;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function measure(plan: PlanResult) {
  const rec = plan.routes.find((x) => x.routeId === plan.recommendedRouteId) ?? null;
  const usual = plan.routes.find((x) => x.routeId === plan.usualFastestRouteId) ?? null;
  return { rec, usual };
}

export function replayScoreScenario(sc: ScoreScenario, graph: Graph, scenario: Scenario = andheriScenario): ScenarioResult {
  let prev: { routeId: string; edgeIds: readonly string[] } | null = null;
  let prevId: string | null = null;
  let changes = 0;
  let noViable = false;
  let worst = 0;
  let last: PlanResult | null = null;
  const initial = planTrip({ graph, origin: sc.originNode, destination: sc.destinationNode, incidents: [], nowS: 0, alerts: scenario.alerts, hasAlertInformation: true });
  const usualEtaS = measure(initial).usual?.etaS ?? 0;
  for (const step of sc.steps) {
    const plan = planTrip({
      graph,
      origin: sc.originNode,
      destination: sc.destinationNode,
      incidents: step.incidents,
      nowS: step.atS,
      alerts: scenario.alerts,
      hasAlertInformation: true,
      previousRecommendation: prev,
      places: scenario.places,
      destinationPlaceId: sc.destinationId,
    });
    last = plan;
    if (plan.noViableRoute) noViable = true;
    const { rec, usual } = measure(plan);
    if (rec && usual) worst = Math.max(worst, rec.etaS - usual.etaS);
    if (rec) {
      if (prevId !== null && prevId !== rec.routeId) changes++;
      prevId = rec.routeId;
      prev = { routeId: rec.routeId, edgeIds: rec.edgeIds };
    }
  }
  const { rec, usual } = measure(last!);
  const usualBlocked = !!usual && !usual.viable;
  const usualExposed = !!usual && usual.hazards.some((h) => h.effect !== 'none');
  const extra = rec && usual ? Math.max(0, rec.etaS - usual.etaS) : 0;
  const slowerNoBlock = !!rec && !!usual && !usualBlocked && rec.etaS - usual.etaS > 60;
  const note = last!.noViableRoute
    ? 'No viable route to this hospital at the end'
    : slowerNoBlock
      ? 'Recommendation is slower and no hard block stood on the usual route'
      : usualBlocked
        ? 'Usual route crosses a hard block; the detour is the cost shown'
        : usualExposed
          ? 'Usual route crosses a reported hazard that is not a hard block'
          : 'No open hazard on the usual route';
  return {
    seed: sc.seed,
    origin: sc.originName,
    destination: sc.destinationName,
    incidents: new Set(sc.steps.flatMap((s) => s.incidents.map((i) => i.id))).size,
    steps: sc.steps.length - 1,
    usualEtaMin: round1(usualEtaS / 60),
    usualBlocked,
    usualExposed,
    extraMin: round1(extra / 60),
    worstExtraMin: round1(Math.max(0, worst) / 60),
    changes,
    noViable,
    slowerNoBlock,
    note,
  };
}

export interface Scoreboard {
  label: string;
  graphVersion: string;
  rulesVersion: number;
  seeds: number[];
  summary: {
    scenarios: number;
    usualBlocked: number;
    usualExposed: number;
    extraMinMedian: number;
    extraMinWorst: number;
    changesTotal: number;
    changesMax: number;
    noViable: number;
    slowerNoBlock: number;
  };
  results: ScenarioResult[];
}

export const SCOREBOARD_LABEL = 'Simulated scenarios on real roads; modelled minutes';

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
}

export function runScoreboard(file: GraphFile = andheriGraph, scenario: Scenario = andheriScenario, seeds: readonly number[] = DEFAULT_SEEDS): Scoreboard {
  const graph = loadGraph(file, 'car');
  const results = seeds.map((seed) => replayScoreScenario(generateScenario(seed, graph, scenario), graph, scenario));
  const extras = results.map((x) => x.extraMin);
  return {
    label: SCOREBOARD_LABEL,
    graphVersion: file.graphVersion,
    rulesVersion: SCORING_RULES.version,
    seeds: [...seeds],
    summary: {
      scenarios: results.length,
      usualBlocked: results.filter((x) => x.usualBlocked).length,
      usualExposed: results.filter((x) => x.usualExposed).length,
      extraMinMedian: median(extras),
      extraMinWorst: Math.max(0, ...extras),
      changesTotal: results.reduce((n, x) => n + x.changes, 0),
      changesMax: Math.max(0, ...results.map((x) => x.changes)),
      noViable: results.filter((x) => x.noViable).length,
      slowerNoBlock: results.filter((x) => x.slowerNoBlock).length,
    },
    results,
  };
}

export function renderScoreboard(b: Scoreboard): string {
  const s = b.summary;
  const yn = (v: boolean) => (v ? 'yes' : 'no');
  const rows = b.results.map(
    (x) =>
      `| ${x.seed} | ${x.origin} → ${x.destination} | ${x.incidents} | ${x.usualEtaMin} | ${yn(x.usualBlocked)} | ${yn(x.usualExposed)} | ${x.extraMin} | ${x.worstExtraMin} | ${x.changes} | ${x.note} |`,
  );
  const unfavourable = b.results.filter((x) => x.noViable || x.slowerNoBlock);
  return `# scoreboard.md

${b.label}. Generated by \`pnpm scoreboard\` from seeds ${b.seeds[0]} to ${b.seeds[b.seeds.length - 1]} (${b.seeds.length} scenarios). Graph \`${b.graphVersion}\`, scoring rules version ${b.rulesVersion}.
Do not edit by hand: run the command again. Two runs with the same seeds give the same file.

## What this measures

For each seed, a trip from a published starting point to one of the three hospitals and one to four simulated
incidents (flooding, congestion, closure, debris, accident) that arrive over about 30 simulated minutes and move from
Unverified towards Corroborated, Verified and sometimes Resolved. After every change the engine plans again from the
starting point, with the switching rule. Each row compares that recommendation with the usual fastest route (the same trip
with no reports).

Every figure is **modelled**, on real road geometry with **simulated** conditions. None of it is a real-world result.

## Headline

| Figure | Value |
| --- | --- |
| Scenarios | ${s.scenarios} |
| Usual fastest route crosses a Corroborated or Verified hard block at the end | ${s.usualBlocked} of ${s.scenarios} |
| Usual fastest route crosses any open reported hazard at the end | ${s.usualExposed} of ${s.scenarios} |
| Extra modelled minutes the final recommendation takes (median / worst) | ${s.extraMinMedian} / ${s.extraMinWorst} min |
| Recommendation changes (total / most in one scenario) | ${s.changesTotal} / ${s.changesMax} |
| Scenarios with no viable route at the end of the run | ${s.noViable} |
| Scenarios where the recommendation is more than a minute slower and no hard block stood on the usual route | ${s.slowerNoBlock} |

## How to read it

- A hard block (a Corroborated or Verified closure or flood) makes the engine route around it by construction, so
  "the route avoids it" is true in every scenario and is **not** reported as a result. What the figures show is how often
  the usual route would have met such a block, and what avoiding it costs in modelled minutes.
- "Extra minutes" is the final recommendation's modelled time minus the usual route's modelled time under the same
  reports (0 when the recommendation is not slower).
- The last column states the case in words. Unfavourable cases are listed in full below and are not filtered out.
- None of these figures is a rate of harm avoided, and the numbers say nothing about real outcomes.

## Unfavourable scenarios

${
    unfavourable.length
      ? unfavourable.map((x) => `- Seed ${x.seed}, ${x.origin} → ${x.destination}: ${x.note}${x.extraMin ? ` (${x.extraMin} extra modelled min)` : ''}.`).join('\n')
      : '- None in this set of seeds.'
  }

## All scenarios

| Seed | Trip | Incidents | Usual route (min) | Usual route blocked | Usual route exposed | Extra min (final) | Extra min (worst step) | Changes | Case |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Limits

- Hazards are placed by a seeded generator, not drawn from real reports. The generator puts about 60% of them on the usual
  fastest route, so the exposure figures describe this test set, not how often real routes meet real hazards.
- The plan is made from the starting point each time; it is not a vehicle driving the route.
- Real roads, simulated conditions. Hindi and Marathi text are not part of this measurement.
`;
}

export function scoreboardJson(b: Scoreboard): string {
  return JSON.stringify(b, null, 2) + '\n';
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const b = runScoreboard();
  writeFileSync(resolve(root, 'docs', 'scoreboard.md'), renderScoreboard(b));
  writeFileSync(resolve(root, 'docs', 'scoreboard.json'), scoreboardJson(b));
  console.log(`wrote docs/scoreboard.md and docs/scoreboard.json (${b.summary.scenarios} scenarios, graph ${b.graphVersion})`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('scoreboard.ts')) main();
