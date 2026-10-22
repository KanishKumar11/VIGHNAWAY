import { describe, expect, it } from 'vitest';
import { ReportInputSchema } from '@vighnaway/contracts';
import { buildReportInput } from '@/components/report/ReportForm';
import { generateDeviceId } from '@/lib/storage';

const base = {
  depth: null,
  congestion: null,
  severity: null,
  impassable: false,
  point: { lat: 19.116357, lng: 72.846569 },
  note: '',
  observed: true,
  deviceId: 'web-abcdefgh12',
};

describe('report form', () => {
  it('builds schema-valid bodies for every type', () => {
    for (const type of ['flood', 'closure', 'debris', 'accident', 'road_clear'] as const) {
      const r = ReportInputSchema.safeParse(buildReportInput({ ...base, type }));
      expect(r.success, type).toBe(true);
    }
    expect(ReportInputSchema.safeParse(buildReportInput({ ...base, type: 'congestion', congestion: 'heavy' })).success).toBe(true);
  });

  it('sends depth only for floods, with Not sure as null', () => {
    expect(buildReportInput({ ...base, type: 'flood', depth: 'unknown' }).depth).toBeNull();
    expect(buildReportInput({ ...base, type: 'flood', depth: 'knee' }).depth).toBe('knee');
    expect('depth' in buildReportInput({ ...base, type: 'closure', depth: 'knee' })).toBe(false);
  });

  it('fails validation for congestion without a level and for a long note', () => {
    expect(ReportInputSchema.safeParse(buildReportInput({ ...base, type: 'congestion' })).success).toBe(false);
    expect(ReportInputSchema.safeParse(buildReportInput({ ...base, type: 'flood', note: 'x'.repeat(201) })).success).toBe(false);
  });

  it('generates device ids the API accepts', () => {
    const id = generateDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(generateDeviceId()).not.toBe(id);
  });
});
