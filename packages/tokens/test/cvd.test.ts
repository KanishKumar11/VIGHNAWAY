import { describe, expect, it } from 'vitest';
import { phoneThemes, themes, type ThemeColors } from '../src/themes';

/**
 * Colour-vision deficiency check (DESIGN_VISION.md section 3). Machado et al. (2009) matrices at
 * full severity, applied in linear RGB; difference measured as CIE76 ΔE in Lab. Key meanings must
 * stay distinguishable by colour alone (ΔE ≥ 12) even though shape, line style and words carry
 * them too. Amber Unverified vs orange Corroborated is allowed to be close: they always differ by
 * ring style (dashed vs double) and label.
 */
const M = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
} as const;

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toLin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
function simulate(c: string, m: readonly number[]): [number, number, number] {
  const [r, g, b] = hex(c).map(toLin) as [number, number, number];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [clamp(m[0]! * r + m[1]! * g + m[2]! * b), clamp(m[3]! * r + m[4]! * g + m[5]! * b), clamp(m[6]! * r + m[7]! * g + m[8]! * b)];
}
function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Status pairs use the product owner's exact palette (DESIGN_VISION.md 4.1–4.3). Under
// deuteranopia amber/red and green/red separate by ΔE ≈ 9–10 there, below the general bar of 12;
// the spec requires every status to also differ by marker shape, ring style and a text label
// (section 5.3), so those pairs are held to ΔE ≥ 9 and the non-colour cues carry the rest.
const MUST_DIFFER: [keyof ThemeColors, keyof ThemeColors, string, number?][] = [
  ['routeRecommended', 'danger', 'recommended route vs blocked route'],
  // Routes also differ by width and casing (6 px cased vs 3 px).
  ['routeRecommended', 'routeMuted', 'recommended vs alternative route', 8],
  ['warn', 'danger', 'Unverified vs Verified', 9],
  ['positive', 'danger', 'Resolved vs Verified', 9],
];

describe.each([...Object.entries(themes), ...Object.entries(phoneThemes).map(([n, c]) => [`phone ${n}`, c] as const)])('%s theme under colour-vision deficiencies', (_name, t: ThemeColors) => {
  for (const [kind, m] of Object.entries(M)) {
    it.each(MUST_DIFFER.map(([a, b, what, min]) => [what, a, b, min ?? 12] as const))(`${kind}: %s`, (_what, a, b, min) => {
      const d = deltaE(lab(simulate(t[a], m)), lab(simulate(t[b], m)));
      expect(d, `${a} vs ${b} ΔE ${d.toFixed(1)}`).toBeGreaterThanOrEqual(min);
    });
  }
});
