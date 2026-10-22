import { describe, expect, it } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { buildReceipt, decodeReceipt, encodeReceipt, loadGraph, planTrip, verifyReceipt } from '../src';
import type { PlanTripInput } from '../src';
import { andheriGraph, andheriScenario, edgesNamed, incident, noAlerts, place } from './helpers';

const car = loadGraph(andheriGraph, 'car');
const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');

const input = (incidents: Incident[] = []): PlanTripInput => ({
  graph: car,
  origin: place('origin-marol').nodeId,
  destination: place('hosp-kokilaben').nodeId,
  incidents,
  nowS: 480,
  places: andheriScenario.places,
  destinationPlaceId: 'hosp-kokilaben',
  ...noAlerts,
});
const ctx = { scenarioId: 'andheri-monsoon', seq: 7, simulated: true };
const recorded = incident({ id: 'r:flood', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, edgeIds: SUBWAY, roadName: 'Andheri Subway' });
const flood = () => ({ ...recorded });

describe('decision receipts', () => {
  it('verifies the same decision from the recorded inputs', () => {
    const inp = input([flood()]);
    const receipt = buildReceipt(ctx, inp, planTrip(inp));
    expect(receipt.simulated).toBe(true);
    const v = verifyReceipt(receipt, input([flood()]));
    expect(v.same).toBe(true);
    expect(v.checks.every((c) => c.ok)).toBe(true);
  });

  it('is deterministic: the same inputs give the same receipt', () => {
    const a = buildReceipt(ctx, input([flood()]), planTrip(input([flood()])));
    const b = buildReceipt(ctx, input([flood()]), planTrip(input([flood()])));
    expect(a).toEqual(b);
    expect(encodeReceipt(a)).toBe(encodeReceipt(b));
  });

  it('round-trips through the URL token, including non-ASCII ids', () => {
    const receipt = buildReceipt({ ...ctx, scenarioId: 'andheri-मानसून' }, input(), planTrip(input()));
    const token = encodeReceipt(receipt);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReceipt(token)).toEqual(receipt);
    // Every token length mod 3 case.
    for (let extra = 0; extra < 3; extra++) {
      const r = { ...receipt, scenarioId: 'x'.repeat(extra + 1) };
      expect(decodeReceipt(encodeReceipt(r))).toEqual(r);
    }
  });

  it('rejects malformed tokens', () => {
    expect(decodeReceipt('')).toBeNull();
    expect(decodeReceipt('not a token!')).toBeNull();
    expect(decodeReceipt('abcde')).toBeNull();
    const good = encodeReceipt(buildReceipt(ctx, input(), planTrip(input())));
    expect(decodeReceipt(good.slice(0, good.length - 7))).toBeNull();
    expect(decodeReceipt(encodeReceipt({ ...JSON.parse(JSON.stringify(buildReceipt(ctx, input(), planTrip(input())))), v: 2 }))).toBeNull();
  });

  it('a tampered receipt shows a mismatch: every field that matters is covered', () => {
    const inp = input([flood()]);
    const receipt = buildReceipt(ctx, inp, planTrip(inp));
    const tampered = (patch: Partial<typeof receipt>) => verifyReceipt({ ...receipt, ...patch }, input([flood()]));
    expect(tampered({ planHash: '0000000000000000' }).checks.find((c) => c.name === 'plan')!.ok).toBe(false);
    expect(tampered({ inputsHash: '0000000000000000' }).checks.find((c) => c.name === 'inputs')!.ok).toBe(false);
    expect(tampered({ rulesHash: '0000000000000000' }).checks.find((c) => c.name === 'rulesHash')!.ok).toBe(false);
    expect(tampered({ graphVersion: 'other' }).checks.find((c) => c.name === 'graphVersion')!.ok).toBe(false);
    expect(tampered({ engineVersion: '9.9.9' }).same).toBe(false);
    expect(tampered({ profile: 'foot' }).same).toBe(false);
  });

  it('different recorded inputs (an incident changed or missing) do not verify', () => {
    const inp = input([flood()]);
    const receipt = buildReceipt(ctx, inp, planTrip(inp));
    const missing = verifyReceipt(receipt, input([]));
    expect(missing.same).toBe(false);
    expect(missing.checks.find((c) => c.name === 'inputs')!.ok).toBe(false);
    const edited = verifyReceipt(receipt, input([{ ...flood(), status: 'verified' as const }]));
    expect(edited.same).toBe(false);
    const later = verifyReceipt(receipt, { ...input([flood()]), nowS: 481 });
    expect(later.same).toBe(false);
  });

  it('a change to any receipt field changes the token', () => {
    const base = buildReceipt(ctx, input(), planTrip(input()));
    const token = encodeReceipt(base);
    for (const patch of [{ seq: 8 }, { simulated: false }, { scenarioId: 'other' }, { evaluatedAtS: 1 }, { previousRouteId: 'x' }]) {
      expect(encodeReceipt({ ...base, ...patch })).not.toBe(token);
    }
  });
});
