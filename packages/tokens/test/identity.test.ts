import { describe, expect, it } from 'vitest';
import { identity, identityContrastPairs } from '../src/identity';

const rgb = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (fg: string, bg: string) => {
  const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('Monsoon Signal identity meets WCAG AA', () => {
  it.each(identityContrastPairs.map((p) => [p.what, p] as const))('%s', (_what, p) => {
    const r = ratio(identity[p.fg], identity[p.bg]);
    expect(r, `${p.fg} on ${p.bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(p.min);
  });
});
