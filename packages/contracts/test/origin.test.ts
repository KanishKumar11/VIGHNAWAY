import { describe, expect, it } from 'vitest';
import {
  API_PATHS,
  ClearAudienceResponseSchema,
  CounterfactualSchema,
  IncidentsResponseSchema,
  ReportInputSchema,
  TextSchema,
} from '../src';

const report = { type: 'flood', point: { lat: 19.1163, lng: 72.8466 }, observedPersonally: false, deviceId: 'device-12345678' } as const;

describe('report origin', () => {
  it('is optional and limited to app, web, audience and prompt', () => {
    expect(ReportInputSchema.safeParse(report).success).toBe(true);
    for (const origin of ['app', 'web', 'audience', 'prompt'] as const) {
      expect(ReportInputSchema.safeParse({ ...report, origin }).success, origin).toBe(true);
    }
    expect(ReportInputSchema.safeParse({ ...report, origin: 'friends' }).success).toBe(false);
    // The schema stays strict: no status or time can ride along with an origin.
    expect(ReportInputSchema.safeParse({ ...report, origin: 'prompt', status: 'verified' }).success).toBe(false);
  });
});

describe('API additions', () => {
  it('has the clear-audience path and response', () => {
    expect(API_PATHS.clearAudience('andheri-monsoon')).toBe('/scenarios/andheri-monsoon/audience/clear');
    expect(ClearAudienceResponseSchema.safeParse({ cleared: 2, incidentIds: ['a', 'b'] }).success).toBe(true);
    expect(ClearAudienceResponseSchema.safeParse({ cleared: -1, incidentIds: [] }).success).toBe(false);
  });

  it('accepts an incidents response with or without observations', () => {
    const base = { scenarioId: 's', seq: 0, full: true, runId: 'r', simTimeS: 0, incidents: [] };
    expect(IncidentsResponseSchema.safeParse(base).success).toBe(true);
    expect(IncidentsResponseSchema.safeParse({ ...base, observations: [{ edgeId: 'e1', lastObservedAtS: 10, kind: 'clear' }] }).success).toBe(true);
    expect(IncidentsResponseSchema.safeParse({ ...base, observations: [{ edgeId: 'e1', lastObservedAtS: 10, kind: 'maybe' }] }).success).toBe(false);
  });
});

describe('structured text and counterfactuals', () => {
  it('round-trips nested text', () => {
    const text = { key: 'reason.avoids.hazard', params: { hazard: { key: 'hazard.at', params: { hazard: { key: 'hazard.closure' }, road: 'Andheri Subway' } } } };
    expect(TextSchema.parse(JSON.parse(JSON.stringify(text)))).toEqual(text);
    expect(TextSchema.safeParse({ key: '' }).success).toBe(false);
  });

  it('accepts each counterfactual kind and rejects a malformed one', () => {
    expect(CounterfactualSchema.safeParse({ kind: 'blocked', blockerIds: ['x'], wouldBeRecommended: true }).success).toBe(true);
    expect(CounterfactualSchema.safeParse({ kind: 'hazards', incidentIds: ['x'], smallest: true }).success).toBe(true);
    expect(CounterfactualSchema.safeParse({ kind: 'time', cutS: 240 }).success).toBe(true);
    expect(CounterfactualSchema.safeParse({ kind: 'none_sufficient', reason: 'time' }).success).toBe(true);
    expect(CounterfactualSchema.safeParse({ kind: 'time', cutS: 0 }).success).toBe(false);
    expect(CounterfactualSchema.safeParse({ kind: 'none_sufficient', reason: 'luck' }).success).toBe(false);
  });
});
