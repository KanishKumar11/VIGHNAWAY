import type { GEdge, Graph } from './graph';
import { MinHeap } from './heap';

export type WeightFn = (edge: GEdge) => number;

export interface Path {
  /** Node indices, origin first. */
  nodes: number[];
  /** Edge indices in travel order. */
  edges: number[];
  weight: number;
}

export interface SearchOptions {
  /** Edge indices that may not be used. */
  bannedEdges?: ReadonlySet<number>;
  /** Node indices that may not be entered. */
  bannedNodes?: ReadonlySet<number>;
  /**
   * Goal-directed search (A*) with a straight-line lower bound. Only valid when every weight is at
   * least the edge's free-flow time, which holds for every weight function in this package.
   * Defaults to true.
   */
  goalDirected?: boolean;
}

/** cos(x) by Taylor series: only + - * /, so every JavaScript engine gives the same bits. */
function detCos(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 12; i++) {
    term = (-term * x2) / ((2 * i - 1) * (2 * i));
    sum += term;
  }
  return sum;
}

const heuristicCache = new WeakMap<Graph, Map<number, Float64Array>>();

/**
 * Lower bound on travel time from every node to `to`: equirectangular distance (99% of it, to
 * absorb the approximation) divided by the fastest speed in the graph. Uses sqrt, which IEEE 754
 * rounds exactly, and the Taylor cosine above, so phone and browser explore identically.
 */
function heuristicTo(graph: Graph, to: number): Float64Array {
  let perGraph = heuristicCache.get(graph);
  if (!perGraph) {
    perGraph = new Map();
    heuristicCache.set(graph, perGraph);
  }
  const hit = perGraph.get(to);
  if (hit) return hit;
  const n = graph.nodeIds.length;
  const h = new Float64Array(n);
  const lat0 = graph.nodeLat[to]!;
  const lng0 = graph.nodeLng[to]!;
  const kx = 111320 * detCos((lat0 * Math.PI) / 180) * 0.99;
  const ky = 110574 * 0.99;
  const inv = 1 / graph.maxSpeedMps;
  for (let i = 0; i < n; i++) {
    const dx = (graph.nodeLng[i]! - lng0) * kx;
    const dy = (graph.nodeLat[i]! - lat0) * ky;
    h[i] = Math.sqrt(dx * dx + dy * dy) * inv;
  }
  if (perGraph.size > 32) perGraph.clear();
  perGraph.set(to, h);
  return h;
}

export const baseTime: WeightFn = (e) => e.timeS;

/**
 * Dijkstra with a binary heap (goal-directed by default, see SearchOptions). Equal-priority ties
 * resolve by node index (= sorted node id), and a node's predecessor only changes on a strictly
 * shorter distance, so results are deterministic. Edges with a non-finite weight are absent.
 */
export function dijkstraIdx(
  graph: Graph,
  from: number,
  to: number,
  weightFn: WeightFn,
  opts: SearchOptions = {},
): Path | null {
  const n = graph.nodeIds.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const heap = new MinHeap();
  const h = opts.goalDirected === false ? null : heuristicTo(graph, to);
  dist[from] = 0;
  heap.push(h ? h[from]! : 0, from);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    const du = dist[u]!;
    for (const ei of graph.out[u]!) {
      if (opts.bannedEdges?.has(ei)) continue;
      const e = graph.edges[ei]!;
      const v = e.to;
      if (done[v] || opts.bannedNodes?.has(v)) continue;
      const w = weightFn(e);
      if (!Number.isFinite(w)) continue;
      const nd = du + w;
      if (nd < dist[v]!) {
        dist[v] = nd;
        prevEdge[v] = ei;
        heap.push(h ? nd + h[v]! : nd, v);
      }
    }
  }
  if (!Number.isFinite(dist[to]!)) return null;
  const edges: number[] = [];
  let cur = to;
  while (cur !== from) {
    const ei = prevEdge[cur]!;
    if (ei < 0) return null;
    edges.push(ei);
    cur = graph.edges[ei]!.from;
  }
  edges.reverse();
  const nodes = [from, ...edges.map((ei) => graph.edges[ei]!.to)];
  return { nodes, edges, weight: dist[to]! };
}

/** Public form taking node ids. */
export function dijkstra(
  graph: Graph,
  from: string,
  to: string,
  weightFn: WeightFn = baseTime,
  opts: SearchOptions = {},
): Path | null {
  const f = graph.nodeIndex.get(from);
  const t = graph.nodeIndex.get(to);
  if (f === undefined || t === undefined) return null;
  if (f === t) return { nodes: [f], edges: [], weight: 0 };
  return dijkstraIdx(graph, f, t, weightFn, opts);
}

export const pathKey = (graph: Graph, p: Path): string => p.edges.map((ei) => graph.edges[ei]!.id).join('|');

export function pathLength(graph: Graph, p: Path): number {
  let s = 0;
  for (const ei of p.edges) s += graph.edges[ei]!.lengthM;
  return s;
}

/**
 * Share of `candidate`'s length that lies on `other`. Both directions of a two-way road count as
 * the same road, so a route and its mirror overlap fully.
 */
export function overlapFraction(graph: Graph, candidate: Path, other: Path): number {
  const otherBase = new Set<string>();
  for (const ei of other.edges) {
    const e = graph.edges[ei]!;
    otherBase.add(e.baseId);
  }
  let shared = 0;
  let total = 0;
  for (const ei of candidate.edges) {
    const e = graph.edges[ei]!;
    total += e.lengthM;
    if (otherBase.has(e.baseId)) shared += e.lengthM;
  }
  return total > 0 ? shared / total : 1;
}

function comparePaths(graph: Graph, a: Path, b: Path): number {
  if (a.weight !== b.weight) return a.weight - b.weight;
  const la = pathLength(graph, a);
  const lb = pathLength(graph, b);
  if (la !== lb) return la - lb;
  const ka = pathKey(graph, a);
  const kb = pathKey(graph, b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export interface YenOptions extends SearchOptions {
  /** Drop a candidate sharing more than this fraction of its length with a better one. */
  overlapLimit?: number;
  /** Upper bound on Dijkstra runs, so a dense graph cannot stall the phone. */
  maxSearches?: number;
}

/**
 * Yen's k-shortest loopless paths. Paths are produced in order of weight; a path sharing more than
 * `overlapLimit` of its length with an already accepted (better) path is dropped, and the search
 * continues until k paths are accepted, candidates run out, or the search budget is spent.
 */
export function yenKShortestIdx(
  graph: Graph,
  from: number,
  to: number,
  k: number,
  weightFn: WeightFn,
  opts: YenOptions = {},
): Path[] {
  const overlapLimit = opts.overlapLimit ?? 0.8;
  let budget = opts.maxSearches ?? 400;
  const first = dijkstraIdx(graph, from, to, weightFn, opts);
  budget--;
  if (!first) return [];
  const found: Path[] = [first];
  const accepted: Path[] = [first];
  const seen = new Set<string>([pathKey(graph, first)]);
  const candidates: Path[] = [];

  while (accepted.length < k && budget > 0) {
    const last = found[found.length - 1]!;
    for (let i = 0; i < last.nodes.length - 1 && budget > 0; i++) {
      const spur = last.nodes[i]!;
      const rootNodes = last.nodes.slice(0, i + 1);
      const rootEdges = last.edges.slice(0, i);
      const bannedEdges = new Set<number>(opts.bannedEdges ?? []);
      for (const p of found) {
        if (p.nodes.length > i && sameRoot(p, rootNodes)) {
          const next = p.edges[i];
          if (next !== undefined) bannedEdges.add(next);
        }
      }
      const bannedNodes = new Set<number>(opts.bannedNodes ?? []);
      for (let j = 0; j < rootNodes.length - 1; j++) bannedNodes.add(rootNodes[j]!);
      const spurPath = dijkstraIdx(graph, spur, to, weightFn, { bannedEdges, bannedNodes, goalDirected: opts.goalDirected });
      budget--;
      if (!spurPath) continue;
      let rootWeight = 0;
      for (const ei of rootEdges) rootWeight += weightFn(graph.edges[ei]!);
      const total: Path = {
        nodes: [...rootNodes.slice(0, -1), ...spurPath.nodes],
        edges: [...rootEdges, ...spurPath.edges],
        weight: rootWeight + spurPath.weight,
      };
      const key = pathKey(graph, total);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(total);
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => comparePaths(graph, a, b));
    const next = candidates.shift()!;
    found.push(next);
    if (accepted.every((a) => overlapFraction(graph, next, a) <= overlapLimit)) accepted.push(next);
  }
  return accepted;
}

function sameRoot(p: Path, rootNodes: number[]): boolean {
  for (let j = 0; j < rootNodes.length; j++) if (p.nodes[j] !== rootNodes[j]) return false;
  return true;
}

/** Public form taking node ids. */
export function yenKShortest(
  graph: Graph,
  from: string,
  to: string,
  k = 5,
  weightFn: WeightFn = baseTime,
  opts: YenOptions = {},
): Path[] {
  const f = graph.nodeIndex.get(from);
  const t = graph.nodeIndex.get(to);
  if (f === undefined || t === undefined || f === t) return [];
  return yenKShortestIdx(graph, f, t, k, weightFn, opts);
}

/**
 * Edge-penalty alternatives: after each round, edges of the routes found so far cost more, which
 * pushes the next search onto a different corridor (for example another railway crossing). Used
 * with Yen because, on dense street grids, Yen's next-shortest paths are often tiny variations.
 */
export function penaltyAlternativesIdx(
  graph: Graph,
  from: number,
  to: number,
  rounds: number,
  factor: number,
  weightFn: WeightFn,
  opts: SearchOptions = {},
): Path[] {
  const multiplier = new Map<string, number>();
  const out: Path[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < rounds; r++) {
    const p = dijkstraIdx(
      graph,
      from,
      to,
      (e) => weightFn(e) * (multiplier.get(e.baseId) ?? 1),
      opts,
    );
    if (!p) break;
    let weight = 0;
    for (const ei of p.edges) weight += weightFn(graph.edges[ei]!);
    const real: Path = { ...p, weight };
    const key = pathKey(graph, real);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(real);
    }
    for (const ei of p.edges) {
      const b = graph.edges[ei]!.baseId;
      multiplier.set(b, (multiplier.get(b) ?? 1) * factor);
    }
  }
  return out;
}
