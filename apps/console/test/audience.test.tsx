import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { findForbiddenWords } from '@vighnaway/contracts';
import { AudienceCard, audienceUrl } from '@/components/console/AudienceCard';
import { EvidenceChips } from '@/components/shared/EvidenceChips';
import { setCurrentLang, t } from '@/i18n';
import { audienceIncidents, audienceLadder, newestAudienceIncident } from '@/lib/audience';
import { SCENARIO_ID } from '@/lib/scenario';
import { makeIncident } from './helpers';

/** P1-3: presenter mode shows a large QR so the room can file hazards, and the status ladder for the newest one. */

const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
const inc = (over: Partial<Incident> & Pick<Incident, 'id'>): Incident =>
  makeIncident({ type: 'flood', point: { lat: 19.116357, lng: 72.846569 }, depth: 'knee', ...over });

afterEach(() => {
  cleanup();
  setCurrentLang('en');
});

describe('audience QR card (presenter mode)', () => {
  it('shows a large QR to the report page in audience mode, the four steps and the address', async () => {
    const { container } = render(wrap(<AudienceCard />));
    expect(screen.getByRole('heading', { name: t.audience.title })).toBeTruthy();
    const qr = container.querySelector('svg[width]');
    expect(Number(qr!.getAttribute('width'))).toBeGreaterThanOrEqual(160);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(await screen.findByText(/audience=1/)).toBeTruthy();
    // Nothing reported yet: no ladder and no clear button.
    expect(screen.getByText(t.audience.ladderEmpty)).toBeTruthy();
    expect(screen.queryByTestId('audience-clear')).toBeNull();
  });

  it('builds the report address: audience flag always, scenario only when it is not the demo', () => {
    expect(audienceUrl(SCENARIO_ID, 'https://x.example/report')).toBe('https://x.example/report?audience=1');
    expect(audienceUrl('other', 'https://x.example/report')).toBe('https://x.example/report?scenario=other&audience=1');
  });

  it('states the evidence rules: Unverified, Corroborated by a second phone, Verified only by the operator', () => {
    const steps = t.audience.steps.join(' ');
    expect(steps).toMatch(/Unverified/);
    expect(steps).toMatch(/Corroborated/);
    expect(steps).toMatch(/Only the operator/);
    expect(t.audience.ladder.corroborated).toMatch(/heuristic/);
    expect(t.audience.ladder.verified).toMatch(/only the operator/);
  });

  it('reads in Hindi and Marathi, with no forbidden words', () => {
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      const all = [t.audience.title, t.audience.qrLabel, t.audience.chip, t.audience.clear, t.audience.ladderTitle, ...t.audience.steps, ...Object.values(t.audience.ladder), t.audience.clearAsk(2), t.audience.cleared(1), t.report.audienceNote];
      for (const s of all) {
        expect(s).toMatch(/[ऀ-ॿ]/);
        expect(findForbiddenWords(s)).toEqual([]);
      }
      expect(t.audience.steps).toHaveLength(4);
    }
  });
});

describe('audience ladder', () => {
  it('finds the newest open audience-only incident and ignores scripted, mixed and closed ones', () => {
    const list = [
      inc({ id: 'a', seq: 1, audienceOnly: true }),
      inc({ id: 'b', seq: 5, audienceOnly: true, status: 'dismissed' }),
      inc({ id: 'c', seq: 7 }),
      inc({ id: 'd', seq: 3, audienceOnly: true, status: 'corroborated' }),
    ];
    expect(newestAudienceIncident(list)!.id).toBe('d');
    expect(audienceIncidents(list).map((i) => i.id)).toEqual(['a', 'd']);
    expect(newestAudienceIncident([])).toBeNull();
  });

  it('climbs Unverified, Corroborated, Verified: earlier rungs done, the current one marked', () => {
    const states = (status: Incident['status'] | null) => audienceLadder(status ? { status } : null).map((s) => s.state);
    expect(states(null)).toEqual(['todo', 'todo', 'todo']);
    expect(states('unverified')).toEqual(['current', 'todo', 'todo']);
    expect(states('corroborated')).toEqual(['done', 'current', 'todo']);
    expect(states('verified')).toEqual(['done', 'done', 'current']);
  });

  it('the card shows the ladder for the newest audience incident, and clear needs a confirmation', async () => {
    const { useLiveStore } = await import('@/stores/live');
    const live = useLiveStore.getState();
    live.applyUpserted({ scenarioId: live.sync.scenarioId, seq: live.sync.lastSeq + 1, incident: inc({ id: 'aud-1', scenarioId: live.sync.scenarioId, seq: live.sync.lastSeq + 1, audienceOnly: true, status: 'corroborated' }), summary: 'x' });
    render(wrap(<AudienceCard />));
    const steps = screen.getByTestId('audience-ladder').querySelectorAll('li');
    expect([...steps].map((li) => li.getAttribute('data-state'))).toEqual(['done', 'current', 'todo']);
    screen.getByTestId('audience-clear').click();
    expect(await screen.findByText(t.audience.clearAsk(1))).toBeTruthy();
    screen.getByText(t.audience.clearCancel).click();
    expect(await screen.findByTestId('audience-clear')).toBeTruthy();
  });
});

describe('audience chip on an incident', () => {
  it('is shown for an audience-only incident, with its status and source still visible', () => {
    render(<EvidenceChips incident={inc({ id: 'x', audienceOnly: true })} nowS={100} />);
    expect(screen.getByTestId('audience-chip').textContent).toBe(t.audience.chip);
    expect(screen.getByText(/Unverified/)).toBeTruthy();
    cleanup();
    render(<EvidenceChips incident={inc({ id: 'y' })} nowS={100} />);
    expect(screen.queryByTestId('audience-chip')).toBeNull();
  });
});
