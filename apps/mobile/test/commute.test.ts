import type { PlanResult } from '@vighnaway/contracts';
import { commuteAlertFor, useCommute, type SavedCommute } from '@/features/commute/commute';
import { en } from '@/i18n/en';
import { hi } from '@/i18n/hi';
import { mr } from '@/i18n/mr';
import { findForbiddenWords } from '@vighnaway/contracts';

/** P2-7: tell the traveller only when the recommendation differs from the saved usual route, and only once per difference. */

const saved: SavedCommute = {
  originId: 'origin-ramesh-nagar',
  destinationId: 'hosp-holy-spirit',
  originName: 'Ramesh Nagar',
  destinationName: 'Holy Spirit Hospital',
  profile: 'car',
  usualRouteId: 'usual',
  usualName: 'Via Andheri Subway',
  lastAlertRouteId: null,
};
const trip = { originId: saved.originId, destinationId: saved.destinationId, profile: saved.profile } as const;
const plan = (recommendedRouteId: string | null, extra: Partial<PlanResult> = {}): PlanResult =>
  ({
    recommendedRouteId,
    noViableRoute: recommendedRouteId === null,
    routes: [
      { routeId: 'usual', name: 'Via Andheri Subway' },
      { routeId: 'other', name: 'Via G K Gokhale Flyover' },
    ],
    ...extra,
  }) as unknown as PlanResult;

describe('commuteAlertFor', () => {
  it('says nothing when the recommendation is the usual route', () => {
    expect(commuteAlertFor(saved, trip, plan('usual'))).toBeNull();
  });

  it('says what changed when it differs, naming the usual route, the new one and the destination', () => {
    expect(commuteAlertFor(saved, trip, plan('other'))).toEqual({ routeId: 'other', routeName: 'Via G K Gokhale Flyover', usualName: 'Via Andheri Subway', destinationName: 'Holy Spirit Hospital' });
  });

  it('is silent for another trip, another profile, no saved commute, and when no route is viable', () => {
    expect(commuteAlertFor(null, trip, plan('other'))).toBeNull();
    expect(commuteAlertFor(saved, { ...trip, destinationId: 'hosp-hbt' }, plan('other'))).toBeNull();
    expect(commuteAlertFor(saved, { ...trip, profile: 'foot' }, plan('other'))).toBeNull();
    expect(commuteAlertFor(saved, trip, plan(null))).toBeNull();
  });

  it('does not repeat the same difference', () => {
    expect(commuteAlertFor({ ...saved, lastAlertRouteId: 'other' }, trip, plan('other'))).toBeNull();
  });
});

describe('commute store', () => {
  beforeEach(() => useCommute.getState().clear());

  it('saves, remembers what it announced, and clears', () => {
    expect(useCommute.getState().saved).toBeNull();
    const { lastAlertRouteId: _drop, ...fields } = saved;
    useCommute.getState().save(fields);
    expect(useCommute.getState().saved).toMatchObject({ usualRouteId: 'usual', lastAlertRouteId: null });
    useCommute.getState().markAlerted('other');
    expect(useCommute.getState().saved?.lastAlertRouteId).toBe('other');
    useCommute.getState().markAlerted(null);
    expect(useCommute.getState().saved?.lastAlertRouteId).toBeNull();
    useCommute.getState().clear();
    expect(useCommute.getState().saved).toBeNull();
  });

  it('does nothing when marking with no saved commute', () => {
    useCommute.getState().markAlerted('other');
    expect(useCommute.getState().saved).toBeNull();
  });
});

describe('text', () => {
  it('is free of safety wording in English, Hindi and Marathi', () => {
    for (const d of [en, hi, mr]) {
      for (const k of ['commuteLabel', 'commuteHint', 'commuteSaved', 'commuteNoTrip', 'commuteAlertTitle', 'commuteAlert'] as const) expect(findForbiddenWords(d[k])).toEqual([]);
    }
  });
});
