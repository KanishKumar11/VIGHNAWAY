import { findForbiddenWords } from '@vighnaway/contracts';
import { statusPill, type StatusInput } from '@/features/navigate/statusModel';
import { enterFixture, leaveFixture } from '@/fixtures/hero';
import { recommendedRoute, useTrip } from '@/stores/trip';

const base: StatusInput = {
  mode: 'live',
  apiUrl: 'http://192.168.1.10:3000',
  cachedAtSimS: null,
  cachedAtWallMs: null,
  clockStartsAt: '2026-07-14T14:04:00+05:30',
  localClock: false,
  fixture: false,
  nowWallMs: 1_000_000,
  mapUnavailable: false,
};

describe('status pill (connection + map fallback merged, DESIGN.md 11.1)', () => {
  it('is quiet when live: one word, no notices', () => {
    expect(statusPill(base)).toMatchObject({ kind: 'live', tone: 'ok', short: 'Live', more: '', notices: [] });
  });

  it('keeps the exact UX copy for the unreachable server with cached incidents', () => {
    const p = statusPill({ ...base, mode: 'unreachable', cachedAtSimS: 480, cachedAtWallMs: 1_000_000 - 6 * 60_000 });
    expect(p).toMatchObject({ kind: 'unreachable', tone: 'warn', short: 'Cached' });
    expect(p.notices[0]!.text).toBe('Server unreachable: using incidents from 14:12 (6 min old)');
  });

  it('merges a connection problem and the map fallback into one pill with a count', () => {
    const p = statusPill({ ...base, mode: 'offline', mapUnavailable: true });
    expect(p.short).toBe('Offline');
    expect(p.more).toBe('+1');
    expect(p.notices.map((n) => n.key)).toEqual(['offline', 'map']);
    expect(p.notices[1]).toEqual({
      key: 'map',
      text: 'Map unavailable: check the Google Maps key or the network',
      sub: 'Schematic view of the road graph, not a map',
      tone: 'neutral',
    });
    expect(p.a11y).toContain('Map unavailable');
  });

  it('labels fixture data first and never uses forbidden words', () => {
    const p = statusPill({ ...base, fixture: true, mapUnavailable: true, localClock: true });
    expect(p.kind).toBe('fixture');
    expect(p.notices.map((n) => n.key)).toEqual(['fixture', 'map']);
    for (const n of p.notices) expect(findForbiddenWords(`${n.text} ${n.sub ?? ''}`)).toEqual([]);
  });

  it('shows the local clock notice when the vehicle runs on a local timer', () => {
    const p = statusPill({ ...base, mode: 'unreachable', localClock: true });
    expect(p.notices.map((n) => n.key)).toEqual(['unreachable', 'localClock']);
    expect(p.short).toBe('No server');
  });
});

describe('no-viable-route hero fixture (scripted end state)', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    leaveFixture();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('blocks every route to the destination and offers the nearest reachable hospital', () => {
    enterFixture('noViable');
    const plan = useTrip.getState().plan!;
    expect(plan.noViableRoute).toBe(true);
    expect(recommendedRoute(plan)).toBeNull();
    expect(plan.reachable?.placeName).toBeTruthy();
    expect(plan.routes.every((r) => !r.viable)).toBe(true);
  });
});
