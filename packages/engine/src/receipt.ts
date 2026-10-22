import type { PlanResult } from '@vighnaway/contracts';
import { hashValue } from './hash';
import { buildIncidentIndex, lightingContext } from './incidents';
import { planHash, planTrip } from './plan';
import type { PlanTripInput } from './plan';
import { SCORING_RULES } from './rules';

/**
 * A decision receipt: everything needed to re-run one recommendation and check that it comes out
 * the same. It proves that the same rules on the same recorded inputs give the same route. It does
 * not prove that the reports were true, or who sent them.
 */

export const ENGINE_VERSION = '0.1.0';
export const RECEIPT_VERSION = 1;

export interface Receipt {
  v: typeof RECEIPT_VERSION;
  scenarioId: string;
  /** Incident snapshot: the last incident seq the decision saw. */
  seq: number;
  /** True for the scripted demo scenario; shared text must then say "Simulated scenario". */
  simulated: boolean;
  graphVersion: string;
  engineVersion: string;
  /** Hash of SCORING_RULES, so a changed rule shows up as a mismatch. */
  rulesHash: string;
  profile: string;
  originNodeId: string;
  destinationNodeId: string;
  destinationPlaceId: string | null;
  /** Simulation time of the decision, seconds. */
  evaluatedAtS: number;
  /** Route being followed when the decision was made (the switching rule depends on it). */
  previousRouteId: string | null;
  inputsHash: string;
  planHash: string;
}

export interface ReceiptContext {
  scenarioId: string;
  seq: number;
  simulated: boolean;
}

export const rulesHash = (): string => hashValue(SCORING_RULES);

/** Hash of every input the decision depends on, including the full incident set. */
export function inputsHash(input: PlanTripInput, meta: Pick<Receipt, 'originNodeId' | 'destinationNodeId'>): string {
  return hashValue({
    graphVersion: input.graph.version,
    profile: input.graph.profile,
    origin: meta.originNodeId,
    destination: meta.destinationNodeId,
    nowS: input.nowS,
    previousRouteId: input.previousRecommendation?.routeId ?? null,
    destinationPlaceId: input.destinationPlaceId ?? null,
    places: (input.places ?? []).map((p) => `${p.id}:${p.nodeId}`),
    alerts: input.alerts,
    hasAlertInformation: input.hasAlertInformation,
    incidents: buildIncidentIndex(input.incidents).fingerprint,
    // The well-lit preference is an input (P2-9); absent when off, so every existing receipt hashes as before.
    ...(lightingContext(input.graph, input) ? { preferLit: true, walkingConcerns: hashValue(lightingContext(input.graph, input)) } : {}),
  });
}

/** Receipt for a plan that was computed from `input`. */
export function buildReceipt(context: ReceiptContext, input: PlanTripInput, plan: PlanResult): Receipt {
  const meta = { originNodeId: plan.originNodeId, destinationNodeId: plan.destinationNodeId };
  return {
    v: RECEIPT_VERSION,
    scenarioId: context.scenarioId,
    seq: context.seq,
    simulated: context.simulated,
    graphVersion: plan.graphVersion,
    engineVersion: ENGINE_VERSION,
    rulesHash: rulesHash(),
    profile: plan.profile,
    ...meta,
    destinationPlaceId: input.destinationPlaceId ?? null,
    evaluatedAtS: plan.evaluatedAtS,
    previousRouteId: input.previousRecommendation?.routeId ?? null,
    inputsHash: inputsHash(input, meta),
    planHash: planHash(plan),
  };
}

export interface ReceiptCheck {
  name: 'engineVersion' | 'rulesHash' | 'graphVersion' | 'profile' | 'inputs' | 'plan';
  ok: boolean;
  expected: string;
  actual: string;
}

export interface ReceiptVerification {
  /** True only when every check passed: the same decision came out. */
  same: boolean;
  checks: ReceiptCheck[];
  plan: PlanResult;
}

/**
 * Re-runs the decision from the recorded inputs and compares it with the receipt. `input` is
 * rebuilt by the caller from the history endpoint (incidents at `receipt.seq`).
 */
export function verifyReceipt(receipt: Receipt, input: PlanTripInput): ReceiptVerification {
  const plan = planTrip(input);
  const meta = { originNodeId: plan.originNodeId, destinationNodeId: plan.destinationNodeId };
  const check = (name: ReceiptCheck['name'], expected: string, actual: string): ReceiptCheck => ({ name, ok: expected === actual, expected, actual });
  const checks = [
    check('engineVersion', receipt.engineVersion, ENGINE_VERSION),
    check('rulesHash', receipt.rulesHash, rulesHash()),
    check('graphVersion', receipt.graphVersion, input.graph.version),
    check('profile', receipt.profile, input.graph.profile),
    check('inputs', receipt.inputsHash, inputsHash(input, meta)),
    check('plan', receipt.planHash, planHash(plan)),
  ];
  return { same: checks.every((c) => c.ok), checks, plan };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** ASCII-safe JSON, so the token needs no UTF-8 encoder (Hermes, browsers and Node all agree). */
const asciiJson = (value: unknown): string =>
  JSON.stringify(value).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Compact URL-safe token for a receipt (base64url of ASCII JSON, no padding). */
export function encodeReceipt(receipt: Receipt): string {
  const s = asciiJson(receipt);
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i);
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < s.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < s.length) out += B64[n & 63]!;
  }
  return out;
}

const STRING_FIELDS = [
  'scenarioId',
  'graphVersion',
  'engineVersion',
  'rulesHash',
  'profile',
  'originNodeId',
  'destinationNodeId',
  'inputsHash',
  'planHash',
] as const;

/** Decodes and validates a token. Returns null for anything that is not a well-formed receipt. */
export function decodeReceipt(token: string): Receipt | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length % 4 === 1) return null;
  let s = '';
  for (let i = 0; i < token.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < token.length ? B64.indexOf(token[i + k]!) : 0));
    const n = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    const bytes = Math.min(3, token.length - i - 1);
    s += String.fromCharCode((n >> 16) & 255);
    if (bytes > 1) s += String.fromCharCode((n >> 8) & 255);
    if (bytes > 2) s += String.fromCharCode(n & 255);
  }
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object' || r.v !== RECEIPT_VERSION) return null;
  for (const k of STRING_FIELDS) if (typeof r[k] !== 'string') return null;
  if (typeof r.simulated !== 'boolean') return null;
  if (!Number.isInteger(r.seq) || !Number.isInteger(r.evaluatedAtS)) return null;
  if (r.previousRouteId !== null && typeof r.previousRouteId !== 'string') return null;
  if (r.destinationPlaceId !== null && typeof r.destinationPlaceId !== 'string') return null;
  return r as unknown as Receipt;
}
