import type { OffMapReport } from '@vighnaway/contracts';
import { describe, expect, it } from 'vitest';
import { clusterOffMap } from '@/lib/offmap';

const r = (id: string, lat: number, lng: number, receivedAtS: number, type: OffMapReport['type'] = 'flood'): OffMapReport => ({
  id,
  type,
  depth: null,
  congestion: null,
  severity: null,
  description: null,
  point: { lat, lng },
  receivedAtS,
});

describe('clusterOffMap', () => {
  it('groups reports that share a cell, counts them and keeps the latest time and the kinds', () => {
    const out = clusterOffMap([r('a', 31.6491, 74.8572, 100), r('b', 31.6492, 74.8573, 300, 'debris'), r('c', 19.1, 72.84, 50)]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ count: 2, latestS: 300, types: ['debris', 'flood'] });
    expect(out[1]).toMatchObject({ count: 1, latestS: 50 });
  });

  it('puts the larger cluster first, then the newer one, and is the same for any input order', () => {
    const list = [r('a', 10, 10, 10), r('b', 20, 20, 90), r('c', 30, 30, 50), r('d', 30, 30, 60)];
    expect(clusterOffMap(list).map((c) => c.count)).toEqual([2, 1, 1]);
    expect(clusterOffMap(list).map((c) => c.latestS)).toEqual([60, 90, 10]);
    expect(clusterOffMap([...list].reverse())).toEqual(clusterOffMap(list));
  });

  it('is empty for no reports', () => {
    expect(clusterOffMap([])).toEqual([]);
  });
});
