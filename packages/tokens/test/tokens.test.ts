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
