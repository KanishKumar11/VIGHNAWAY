import { describe, expect, it } from 'vitest';
import { googleMapStyles, spacing, themes } from '../src';

describe('tokens', () => {
  it('keeps the spacing scale on the 4/8-point grid', () => {
    for (const v of Object.values(spacing)) expect(v % 4).toBe(0);
  });
  it.each(Object.keys(themes) as (keyof typeof themes)[])('never uses route or hazard colours in the %s basemap', (name) => {
    const t = themes[name];
    const reserved = [t.routeRecommended, t.accent, t.warn, t.danger, t.corroborated, t.positive].map((c) => c.toLowerCase());
    const json = JSON.stringify(googleMapStyles[name]).toLowerCase();
    for (const c of reserved) expect(json).not.toContain(c);
  });
});

describe('incident icons', () => {
  it('has a pictogram for every incident type and for road clear', async () => {
    const { incidentIcons } = await import('../src');
    expect(Object.keys(incidentIcons).sort()).toEqual(['accident', 'closure', 'congestion', 'debris', 'flood', 'road_clear', 'walking_concern']);
  });
  it('carries no colour: surfaces pass their own ink', async () => {
    const { incidentIcons } = await import('../src');
    const json = JSON.stringify(incidentIcons);
    expect(json).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(json).not.toMatch(/rgb|hsl/i);
  });
  it('keeps every path inside the 24-unit grid and every layer non-empty', async () => {
    const { incidentIcons } = await import('../src');
    for (const layers of Object.values(incidentIcons)) {
      expect(layers.length).toBeGreaterThan(0);
      for (const l of layers) {
        expect(l.d.length).toBeGreaterThan(10);
        // Absolute coordinates in the d strings stay within 0..24 (relative ones are small by construction).
        for (const n of l.d.match(/(?<![a-z])[MLHVZ]\s*-?\d+(\.\d+)?/g) ?? []) expect(Math.abs(Number(n.replace(/[A-Z]/g, '')))).toBeLessThanOrEqual(24);
      }
    }
  });
});
