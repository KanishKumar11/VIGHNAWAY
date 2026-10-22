import { describe, expect, it } from 'vitest';
import { ReportInputSchema } from '../src/reports';
import { decodeRelay, encodeRelay, RELAY_MAX_CHARS, RELAY_PREFIX } from '../src/relay';

const report = ReportInputSchema.parse({
  type: 'flood',
  depth: 'knee',
  point: { lat: 19.12379, lng: 72.85037 },
  observedPersonally: true,
  deviceId: 'vw-0a1b2c3d4e5f6a7b8c9d',
  clientReportId: '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e9f0a11',
  observedAtS: 1260,
  description: 'Water over the kerb, cars turning back',
});

describe('offline relay payload', () => {
  it('round-trips a report with its device id, client id and observed time', () => {
    const text = encodeRelay('andheri-monsoon', report);
    expect(text.startsWith(RELAY_PREFIX)).toBe(true);
    const back = decodeRelay(text);
    expect(back).toEqual({ ok: true, payload: { v: 1, s: 'andheri-monsoon', r: report } });
  });

  it('stays small enough for one QR code', () => {
    const longest = { ...report, description: 'x'.repeat(200) };
    expect(encodeRelay('andheri-monsoon', longest).length).toBeLessThan(RELAY_MAX_CHARS / 3);
  });

  it('refuses a report without a client id (it could not be told apart from a repeat)', () => {
    const { clientReportId: _drop, ...bare } = report;
    expect(() => encodeRelay('andheri-monsoon', bare)).toThrow();
  });

  it('refuses text that is not a VIGHNAWAY relay code, without parsing it', () => {
    expect(decodeRelay('https://example.com')).toEqual({ ok: false, reason: 'not_vighnaway' });
    expect(decodeRelay('')).toEqual({ ok: false, reason: 'not_vighnaway' });
  });

  it('refuses broken, oversized, altered and extra-field payloads', () => {
    expect(decodeRelay(`${RELAY_PREFIX}{nope`)).toEqual({ ok: false, reason: 'bad_json' });
    expect(decodeRelay(RELAY_PREFIX + 'x'.repeat(RELAY_MAX_CHARS))).toEqual({ ok: false, reason: 'too_long' });
    const good = JSON.parse(encodeRelay('andheri-monsoon', report).slice(RELAY_PREFIX.length));
    expect(decodeRelay(RELAY_PREFIX + JSON.stringify({ ...good, v: 2 }))).toEqual({ ok: false, reason: 'bad_payload' });
    expect(decodeRelay(RELAY_PREFIX + JSON.stringify({ ...good, extra: true }))).toEqual({ ok: false, reason: 'bad_payload' });
    expect(decodeRelay(RELAY_PREFIX + JSON.stringify({ ...good, r: { ...good.r, status: 'verified' } }))).toEqual({ ok: false, reason: 'bad_payload' });
    expect(decodeRelay(RELAY_PREFIX + JSON.stringify({ ...good, s: 'Bad Id!' }))).toEqual({ ok: false, reason: 'bad_payload' });
  });

  it('carries no status or verification: a relayed report is an ordinary report', () => {
    const decoded = decodeRelay(encodeRelay('andheri-monsoon', report));
    expect(decoded.ok && Object.keys(decoded.payload.r)).not.toContain('status');
  });
});
