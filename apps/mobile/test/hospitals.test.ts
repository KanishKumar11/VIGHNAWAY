import { findForbiddenWords, type HospitalStatesResponse } from '@vighnaway/contracts';
import { hospitalStateNote } from '@/features/navigate/hospitalState';
import { en } from '@/i18n/en';
import { hi } from '@/i18n/hi';
import { mr } from '@/i18n/mr';
import { api } from '@/lib/api';
import { useHospitals } from '@/stores/hospitals';

/** P2-4.c (phone): hospitals the control room marked Busy or Diverting say so, and who set it. */

const response = (states: Record<string, 'accepting' | 'busy' | 'diverting'>, simulated = true): HospitalStatesResponse => ({
  scenarioId: 'andheri-monsoon',
  simulated,
  hospitals: ['hosp-hbt', 'hosp-holy-spirit', 'hosp-kokilaben'].map((placeId) => ({
    placeId,
    name: placeId,
    state: states[placeId] ?? 'accepting',
    setAtS: states[placeId] ? 120 : null,
    setBy: states[placeId] ? ('operator' as const) : null,
  })),
});

beforeEach(() => {
  useHospitals.setState({ states: {}, simulated: true, loadedAtMs: null });
});
afterEach(() => jest.restoreAllMocks());

describe('hospitalStateNote', () => {
  it('says nothing for a hospital that is accepting or unknown', () => {
    expect(hospitalStateNote(undefined, true)).toBeNull();
    expect(hospitalStateNote('accepting', true)).toBeNull();
  });

  it('names the state and who set it, with "simulated" in the demo', () => {
    expect(hospitalStateNote('busy', true)).toBe('Busy. Set by control room (simulated)');
    expect(hospitalStateNote('diverting', false)).toBe('Diverting. Set by control room');
  });

  it('has Hindi and Marathi text without a forbidden word', () => {
    for (const d of [en, hi, mr]) {
      for (const k of ['hospitalBusy', 'hospitalDiverting', 'hospitalSetBy', 'hospitalSetBySimulated'] as const) expect(findForbiddenWords(d[k])).toEqual([]);
    }
  });
});

describe('hospital store', () => {
  it('keeps only the hospitals that are not accepting', () => {
    useHospitals.getState().apply(response({ 'hosp-holy-spirit': 'diverting', 'hosp-hbt': 'busy' }));
    expect(useHospitals.getState().states).toEqual({ 'hosp-holy-spirit': 'diverting', 'hosp-hbt': 'busy' });
    expect(useHospitals.getState().simulated).toBe(true);
    useHospitals.getState().apply(response({}));
    expect(useHospitals.getState().states).toEqual({});
  });

  it('loads from the API, and an unreachable server leaves what it had', async () => {
    const spy = jest.spyOn(api, 'hospitals').mockResolvedValueOnce(response({ 'hosp-hbt': 'busy' })).mockRejectedValueOnce(new Error('offline'));
    await useHospitals.getState().load();
    expect(useHospitals.getState().states).toEqual({ 'hosp-hbt': 'busy' });
    await useHospitals.getState().load();
    expect(useHospitals.getState().states).toEqual({ 'hosp-hbt': 'busy' });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
