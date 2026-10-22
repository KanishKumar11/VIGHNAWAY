import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AlertSchema } from '@vighnaway/contracts';
import { describe, expect, it } from 'vitest';
import { parseCap } from '../../src/alerts/cap';

const xml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'cap-mumbai.xml'), 'utf8');
const opts = { clockStartsAt: '2026-01-01T00:00:00+05:30', now: new Date('2026-07-14T10:00:00+05:30') };

describe('CAP rain alert parser (hand-written fixture)', () => {
  const out = parseCap(xml, opts);

  it('keeps the active Mumbai rain alerts and says why each other one was left out', () => {
    expect(out.alerts.map((a) => a.id)).toEqual(['cap:FIXTURE-HINDI-FIRST', 'cap:FIXTURE-RAIN-1']);
    expect(out.stats).toEqual({
      read: 7,
      kept: 2,
      skipped: { notActual: 1, cancelled: 1, expired: 1, otherArea: 1, notRain: 1, invalid: 0 },
    });
  });

  it('produces valid, non-simulated alerts that name their source and use scenario seconds', () => {
    for (const a of out.alerts) {
      expect(AlertSchema.safeParse(a).success).toBe(true);
      expect(a.simulated).toBe(false);
      expect(a.source).toContain('CAP alert');
    }
    const rain = out.alerts.find((a) => a.id === 'cap:FIXTURE-RAIN-1')!;
    const startMs = Date.parse(opts.clockStartsAt);
    expect(rain.activeFromS).toBe((Date.parse('2026-07-14T08:00:00+05:30') - startMs) / 1000);
    expect(rain.activeUntilS).toBe((Date.parse('2026-07-14T20:00:00+05:30') - startMs) / 1000);
  });

  it('uses the first usable <info> block when an alert has several languages', () => {
    const a = out.alerts.find((x) => x.id === 'cap:FIXTURE-HINDI-FIRST')!;
    expect(a.label).toBe('Very heavy rain, Mumbai and Konkan');
    expect(a.activeUntilS).toBeNull();
  });

  it('treats feed text as plain text: markup is stripped and length is capped', () => {
    const rain = out.alerts.find((a) => a.id === 'cap:FIXTURE-RAIN-1')!;
    expect(rain.label).toBe('Heavy rain likely in Mumbai suburbs today');
    const long = `<alert><identifier>x y/<z></identifier><status>Actual</status><msgType>Alert</msgType><info><event>Rain</event><effective>2026-07-14T08:00:00Z</effective><headline>${'a'.repeat(500)}</headline><area><areaDesc>Mumbai</areaDesc></area></info></alert>`;
    const r = parseCap(long, opts).alerts[0]!;
    expect(r.label.length).toBe(160);
    expect(r.id).toMatch(/^cap:[A-Za-z0-9_.:-]+$/);
  });

  it('an alert becomes expired exactly when its expiry passes, and bad input gives nothing', () => {
    const at = (iso: string) => parseCap(xml, { ...opts, now: new Date(iso) }).alerts.map((a) => a.id);
    expect(at('2026-07-14T19:59:59+05:30')).toContain('cap:FIXTURE-RAIN-1');
    expect(at('2026-07-14T20:00:00+05:30')).not.toContain('cap:FIXTURE-RAIN-1');
    expect(parseCap('not xml at all', opts).alerts).toEqual([]);
    expect(parseCap(xml, { ...opts, clockStartsAt: 'nope' }).alerts).toEqual([]);
  });

  it('is deterministic', () => {
    expect(parseCap(xml, opts)).toEqual(out);
  });
});
