import { afterEach, describe, expect, it } from 'vitest';
import { findForbiddenWords, ReportInputSchema } from '@vighnaway/contracts';
import { buildReportInput } from '@/components/report/ReportForm';
import { setCurrentLang, t } from '@/i18n';
import { usePrefs } from '@/stores/prefs';
import { makeIncident } from './helpers';

/** P2-8 (console): walking concerns read as facts about a road, the report form has no free text for them, and the map layer can be switched off. */

afterEach(() => setCurrentLang('en'));

const point = { lat: 19.12379, lng: 72.85037 };
const form = { depth: null, congestion: null, severity: null, impassable: false, point, observed: true, deviceId: 'vw-0a1b2c3d4e5f' } as const;

describe('report form input for a walking concern', () => {
  it('sends the concern and drops the note, so nothing can name a person or a place', () => {
    const input = buildReportInput({ ...form, type: 'walking_concern', concern: 'poorly_lit', note: 'near the shop of Mr X' });
    expect(input).toMatchObject({ type: 'walking_concern', concern: 'poorly_lit' });
    expect(input.description).toBeUndefined();
    expect(ReportInputSchema.safeParse(input).success).toBe(true);
  });

  it('is invalid without a concern, and other types never carry one', () => {
    expect(ReportInputSchema.safeParse(buildReportInput({ ...form, type: 'walking_concern', concern: null, note: '' })).success).toBe(false);
    expect(buildReportInput({ ...form, type: 'flood', depth: 'knee', concern: 'isolated', note: '' }).concern).toBeUndefined();
  });
});

describe('labels', () => {
  const poor = makeIncident({ id: 'wc-1', type: 'walking_concern', concern: 'poorly_lit', point });
  const lonely = makeIncident({ id: 'wc-2', type: 'walking_concern', concern: 'isolated', point });

  it('name the condition of the road in English, Hindi and Marathi', () => {
    expect(t.evidence.hazard(poor)).toBe('Poorly lit road');
    expect(t.evidence.hazard(lonely)).toBe('Isolated stretch');
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      expect(t.evidence.hazard(poor)).not.toBe('Poorly lit road');
      expect(t.evidence.hazard(poor).length).toBeGreaterThan(3);
      expect(t.evidence.hazard(lonely)).not.toBe(t.evidence.hazard(poor));
    }
  });

  it('use no safety wording in any language', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setCurrentLang(lang);
      const texts = [t.report.types.walking_concern, t.report.concernLabel, ...Object.values(t.report.concern), t.report.concernHint, t.report.errors.concern, t.view.walking, t.view.walkingHint, t.evidence.hazard(poor), t.evidence.hazard(lonely)];
      for (const text of texts) expect(findForbiddenWords(text)).toEqual([]);
    }
  });
});

describe('map layer', () => {
  it('is on by default and can be turned off', () => {
    expect(usePrefs.getState().walking).toBe(true);
    usePrefs.getState().set('walking', false);
    expect(usePrefs.getState().walking).toBe(false);
    usePrefs.getState().set('walking', true);
  });
});
