import { describe, expect, it } from 'vitest';
import {
  findForbiddenWords,
  formatAge,
  formatDelta,
  formatDuration,
  formatSimClock,
  ReportInputSchema,
} from '../src';

const base = {
  point: { lat: 19.1163, lng: 72.8466 },
  observedPersonally: true,
  deviceId: 'device-abc-123',
};

describe('ReportInputSchema', () => {
  it('accepts a flood report with depth', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'flood', depth: 'knee' }).success).toBe(true);
  });
  it('accepts a flood report with no depth (treated as knee by the engine)', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'flood' }).success).toBe(true);
  });
  it('rejects depth on a closure', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'closure', depth: 'knee' }).success).toBe(false);
  });
  it('requires a congestion level for congestion', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'congestion' }).success).toBe(false);
    expect(
      ReportInputSchema.safeParse({ ...base, type: 'congestion', congestion: 'heavy' }).success,
    ).toBe(true);
  });
  it('rejects descriptions over 200 characters and unknown keys', () => {
    expect(
      ReportInputSchema.safeParse({ ...base, type: 'debris', description: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, type: 'debris', reportedAt: 5 }).success).toBe(false);
  });
  it('rejects malformed device ids', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'debris', deviceId: '<b>' }).success).toBe(false);
  });
});

describe('formatters', () => {
  it('formats the simulation clock from the scenario start', () => {
    expect(formatSimClock('2026-07-14T14:05:00+05:30', 0)).toBe('14:05');
    expect(formatSimClock('2026-07-14T14:05:00+05:30', 7 * 60 + 30)).toBe('14:12');
  });
  it('formats ages, durations and deltas', () => {
    expect(formatAge(30)).toBe('Just now');
    expect(formatAge(12 * 60)).toBe('12 min');
    expect(formatAge(3 * 3600 + 300)).toBe('3 h 5 min');
    expect(formatDuration(61)).toBe('2 min');
    expect(formatDelta(360)).toBe('+6 min');
  });
  it('finds forbidden words', () => {
    expect(findForbiddenWords('Recommended route, no reported hazards')).toEqual([]);
    expect(findForbiddenWords('The safest route')).toEqual(['safest']);
    expect(findForbiddenWords('Safe to drive')).toEqual(['safe']);
  });
});

import { IncidentSchema, sourceLabel, statusLabel } from '../src';

describe('live feed labels', () => {
  const feed = {
    provider: 'tomtom' as const, externalId: 'tt-1', delayS: 240, magnitude: 3, probability: 'certain' as const,
    description: 'Stationary traffic', from: 'A', to: 'B', lastSeenAtS: 10,
  };
  it('names the provider and never says confirmed', () => {
    const label = statusLabel({ status: 'corroborated', deviceCount: 0, verifiedBy: null, source: 'live_feed', feed });
    expect(label).toBe('Reported by TomTom live traffic');
    expect(sourceLabel({ source: 'live_feed', feed })).toBe('TomTom live traffic');
    expect(statusLabel({ status: 'corroborated', deviceCount: 2, verifiedBy: null, source: 'user_report' })).toBe('Corroborated (2 devices)');
  });
  it('keeps incidents without a feed field valid', () => {
    const base = {
      id: 's:inc:1', scenarioId: 's', type: 'congestion', status: 'unverified', source: 'user_report', depth: null,
      congestion: 'heavy', severity: null, impassable: false, conflicting: false, edgeIds: ['a-b-0'],
      point: { lat: 19.1, lng: 72.8 }, roadName: null, reportCount: 1, deviceCount: 1, createdAtS: 0, lastReportAtS: 0,
      updatedAtS: 0, verifiedAtS: null, verifiedBy: null, closedAtS: null, linkedIncidentId: null, note: null, seq: 1,
    };
    expect(IncidentSchema.safeParse(base).success).toBe(true);
    expect(IncidentSchema.safeParse({ ...base, source: 'live_feed', status: 'corroborated', feed }).success).toBe(true);
  });
});
