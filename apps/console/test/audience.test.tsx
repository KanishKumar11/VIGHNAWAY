import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import { AudienceCard } from '@/components/console/AudienceCard';
import { setCurrentLang, t } from '@/i18n';

/** P1-3 (console half): presenter mode shows a large QR so the room can file hazards from their phones. */

afterEach(() => {
  cleanup();
  setCurrentLang('en');
});

describe('audience QR card (presenter mode)', () => {
  it('shows a large QR to the report page, the four steps and the report address', async () => {
    const { container } = render(<AudienceCard />);
    expect(screen.getByRole('heading', { name: t.audience.title })).toBeTruthy();
    const qr = container.querySelector('svg[role="img"], svg title')?.closest('svg') ?? container.querySelector('svg');
    expect(qr).toBeTruthy();
    expect(Number(qr!.getAttribute('width'))).toBeGreaterThanOrEqual(160);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    // The address under the code ends in /report (or carries the scenario), so a phone can type it.
    expect(await screen.findByText(/\/report/)).toBeTruthy();
  });

  it('states the evidence rules: Unverified, Corroborated by a second phone, Verified only by the operator', () => {
    render(<AudienceCard />);
    const steps = t.audience.steps.join(' ');
    expect(steps).toMatch(/Unverified/);
    expect(steps).toMatch(/Corroborated/);
    expect(steps).toMatch(/Only the operator/);
    expect(steps).toMatch(/Verified/);
  });

  it('reads in Hindi and Marathi, with no forbidden words', () => {
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      for (const s of [t.audience.title, t.audience.qrLabel, ...t.audience.steps]) {
        expect(s).toMatch(/[ऀ-ॿ]/);
        expect(findForbiddenWords(s)).toEqual([]);
      }
      expect(t.audience.steps).toHaveLength(4);
    }
  });
});
