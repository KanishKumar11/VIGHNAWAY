import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import type { CoverageClass } from '@vighnaway/engine';
import { coverageClass } from '@vighnaway/engine';
import { CoverageChip, coverageLabel } from '@/components/console/CoverageChip';
import { setCurrentLang, t } from '@/i18n';

/** P1-5: the coverage chip says how recent a road's latest report is, in words as well as pattern. */

const NOW = 20 * 3600;
const road = (ageS: number | null) => ({ class: coverageClass(ageS) as CoverageClass, lastObservedAtS: ageS === null ? null : NOW - ageS });

afterEach(() => {
  cleanup();
  setCurrentLang('en');
});

describe('coverage chip', () => {
  it('names each class, with the age for ageing and stale roads', () => {
    expect(coverageLabel(road(600), NOW)).toBe('Fresh');
    expect(coverageLabel(road(3600), NOW)).toBe('Ageing · 1 h');
    expect(coverageLabel(road(5 * 3600), NOW)).toBe('Stale · 5 h');
    expect(coverageLabel(road(null), NOW)).toBe('No reports');
  });

  it('draws a different pattern for each class, so it reads without colour', () => {
    const dashes = (ageS: number | null) => {
      const { container } = render(<CoverageChip road={road(ageS)} nowS={NOW} />);
      const d = container.querySelector('line')!.getAttribute('stroke-dasharray');
      cleanup();
      return d;
    };
    const patterns = [dashes(600), dashes(3600), dashes(5 * 3600), dashes(null)];
    expect(patterns[0]).toBeNull();
    expect(new Set(patterns).size).toBe(4);
  });

  it('exposes the class for tests and assistive tech, and says "no reports" is not "clear"', () => {
    render(<CoverageChip road={road(null)} nowS={NOW} />);
    expect(screen.getByText('No reports').closest('[data-coverage]')?.getAttribute('data-coverage')).toBe('none');
    expect(t.coverage.note).toMatch(/not the same as clear/);
  });

  it('reads in Hindi and Marathi, with no forbidden words', () => {
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      const labels = [600, 3600, 5 * 3600, null].map((a) => coverageLabel(road(a), NOW));
      expect(new Set(labels).size).toBe(4);
      for (const s of [...labels, t.coverage.note, t.coverage.title]) {
        expect(s).toMatch(/[ऀ-ॿ]/);
        expect(findForbiddenWords(s)).toEqual([]);
      }
    }
  });
});
