import { describe, expect, it } from 'vitest';
import { timezoneLabel } from '@/lib/timezone';

describe('timezoneLabel', () => {
  it('abbreviates the scenario zone instead of using a typed label', () => {
    expect(timezoneLabel('Asia/Kolkata', 'fallback')).toBe('IST');
  });
  it('falls back when there is no zone, or the runtime does not know it', () => {
    expect(timezoneLabel(undefined, 'IST')).toBe('IST');
    expect(timezoneLabel('Not/AZone', 'IST')).toBe('IST');
  });
});
