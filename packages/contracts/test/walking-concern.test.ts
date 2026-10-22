import { describe, expect, it } from 'vitest';
import { findForbiddenWords } from '../src/copy';
import { INCIDENT_TYPE_LABEL, WALKING_CONCERN_LABEL, WALKING_CONCERNS } from '../src/incidents';
import { ReportInputSchema } from '../src/reports';

/** P2-8: the report contract for walking concerns is the safeguard: a condition of a road, no free text. */

const base = { type: 'walking_concern', concern: 'poorly_lit', point: { lat: 19.12, lng: 72.85 }, observedPersonally: true, deviceId: 'vw-0a1b2c3d4e5f' };

describe('walking concern report', () => {
  it('accepts a concern with nothing else', () => {
    for (const c of WALKING_CONCERNS) expect(ReportInputSchema.safeParse({ ...base, concern: c }).success).toBe(true);
  });

  it('needs a concern, and refuses a note, severity, depth, congestion and impassable', () => {
    expect(ReportInputSchema.safeParse({ ...base, concern: undefined }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, description: 'near Mr X shop' }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, severity: 'high' }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, depth: 'knee' }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, congestion: 'heavy' }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...base, impassable: true }).success).toBe(false);
  });

  it('keeps concern off every other type', () => {
    expect(ReportInputSchema.safeParse({ ...base, type: 'flood', concern: 'isolated', depth: 'knee' }).success).toBe(false);
  });

  it('has labels that are factual and free of safety wording', () => {
    for (const text of [...Object.values(WALKING_CONCERN_LABEL), INCIDENT_TYPE_LABEL.walking_concern]) expect(findForbiddenWords(text)).toEqual([]);
    expect(Object.values(WALKING_CONCERN_LABEL).join(' ')).not.toMatch(/safe|danger|unsafe/i);
  });
});
