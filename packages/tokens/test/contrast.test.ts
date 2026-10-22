import { describe, expect, it } from 'vitest';
import { brandContrastPairs, chromeContrastPairs, consoleBrand, consoleChrome, consoleThemes, contrastPairs, phoneBrand, phoneBrandContrastPairs, phoneThemes, themes, type ThemeColors } from '../src/themes';

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c)!;
  const [r, g, b, a = '1'] = m[1]!.split(',').map((s) => s.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}
/** Alpha colours are composited over the theme's card (text surfaces) or map field. */
function solid(c: string, under: string): [number, number, number] {
  const [r, g, b, a] = parse(c);
  if (a === 1) return [r, g, b];
  const [ur, ug, ub] = solid(under, '#FFFFFF');
  return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function contrast(fg: string, bg: string, base: string): number {
  const b = solid(bg, base);
  const f = solid(fg, `rgb(${b.join(',')})`);
  const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([...Object.entries(themes), ...Object.entries(phoneThemes).map(([n, c]) => [`phone ${n}`, c] as const), ...Object.entries(consoleThemes).map(([n, c]) => [`console ${n}`, c] as const)])('%s theme meets WCAG AA', (_name, t: ThemeColors) => {
  it.each(contrastPairs.map((p) => [p.what, p] as const))('%s', (_what, p) => {
    const ratio = contrast(t[p.fg], t[p.bg], t.panel);
    expect(ratio, `${p.fg} on ${p.bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(p.min);
  });
});

describe('console chrome meets WCAG AA', () => {
  it.each(chromeContrastPairs.map((p) => [p.what, p] as const))('%s', (_what, p) => {
    const ratio = contrast(consoleChrome[p.fg], consoleChrome[p.bg], consoleChrome.chromeBg);
    expect(ratio, `${p.fg} on ${p.bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(p.min);
  });
});

describe('console brand meets WCAG AA', () => {
  it.each(brandContrastPairs.map((p) => [p.what, p] as const))('%s', (_what, p) => {
    const ratio = contrast(consoleBrand[p.fg], consoleBrand[p.bg], consoleBrand.onBrand);
    expect(ratio, `${p.fg} on ${p.bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(p.min);
  });
});

describe.each(Object.entries(phoneBrand))('phone brand layer (%s) meets WCAG AA', (_name, b) => {
  it.each(phoneBrandContrastPairs.map((p) => [p.what, p] as const))('%s', (_what, p) => {
    const ratio = contrast(b[p.fg], b[p.bg], b.hero);
    expect(ratio, `${p.fg} on ${p.bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(p.min);
  });
});

describe('themes', () => {
  it('have identical keys', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort());
    expect(Object.keys(consoleThemes.light).sort()).toEqual(Object.keys(themes.light).sort());
    expect(Object.keys(phoneThemes.light).sort()).toEqual(Object.keys(themes.light).sort());
    expect(Object.keys(phoneThemes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });
});
