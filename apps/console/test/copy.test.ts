import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import { en } from '@/i18n/en';

/** Every string in the i18n file, calling templates with sample arguments. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') {
    const fn = v as (...a: unknown[]) => unknown;
    const mixed = Array.from({ length: fn.length }, (_, i) => (i % 2 === 0 ? 'Sample' : 2));
    const numbers = Array.from({ length: fn.length }, () => 2);
    try {
      return [String(fn(...mixed))];
    } catch {
      return [String(fn(...numbers))];
    }
  }
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

describe('copy', () => {
  const all = strings(en);

  it('never says safe, safest, guaranteed or shows a safety percentage', () => {
    const bad = all.filter((s) => findForbiddenWords(s).length > 0);
    expect(bad).toEqual([]);
  });

  it('never says "confirmed" for corroboration and uses no exclamation marks', () => {
    expect(all.filter((s) => /\bconfirmed\b/i.test(s) && /corroborat/i.test(s))).toEqual([]);
    expect(all.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('uses the exact UX_FLOWS copy for key states', () => {
    expect(en.queue.empty).toBe('No incidents yet. Press Play to start the simulated scenario.');
    expect(en.map.unavailable).toBe('Map unavailable: check the Google Maps key or the network');
    expect(en.connection.apiUnreachable('http://x')).toBe('Server unreachable at http://x. Showing the last data received.');
    expect(en.queue.actionFailed('verify', 'boom')).toBe('Could not verify this incident: boom. Change undone.');
    expect(en.report.sent).toBe('Sent. Shown as Unverified until confirmed.');
    expect(en.operator.rejected).toBe('Token rejected');
  });

  it('never renders user text as HTML', () => {
    const src = join(__dirname, '..', 'src');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const offenders = walk(src).filter((f) => /\.(tsx?)$/.test(f) && readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });

  it('keeps OPERATOR_TOKEN out of NEXT_PUBLIC_* configuration', () => {
    const src = join(__dirname, '..', 'src');
    const env = readFileSync(join(src, 'lib', 'env.ts'), 'utf8');
    expect(env).not.toMatch(/NEXT_PUBLIC_[A-Z_]*TOKEN/);
    const example = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
    expect(example).not.toMatch(/^NEXT_PUBLIC_[A-Z_]*TOKEN/m);
  });
});
