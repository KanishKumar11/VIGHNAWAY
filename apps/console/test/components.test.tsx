import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { IncidentQueue } from '@/components/console/IncidentQueue';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import { EvidenceChips } from '@/components/shared/EvidenceChips';
import { Toaster, useToasts } from '@/components/ui/toast';
import { makeIncident, scenarioEvent } from './helpers';

const SID = andheriScenario.id;
const point = scenarioEvent(andheriScenario, 'ev02-knee').report.point;
const flood = (over: Partial<Incident> = {}): Incident =>
  makeIncident({ id: 'flood-1', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, point, seq: 1, lastReportAtS: 180, updatedAtS: 180, note: '<b>Water</b> up to the knee', ...over });

function seed(incidents: Incident[]) {
  useLiveStore.setState({ optimistic: {}, confirmed: {}, pulses: {}, ticker: [] });
  useLiveStore.getState().applyReset({ scenarioId: SID, runId: 'x', seq: 0 });
  useLiveStore.getState().applySnapshot({ scenarioId: SID, seq: incidents.length, full: true, runId: 'run-1', simTimeS: 300, incidents });
}

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useToasts.setState({ toasts: [] });
});

describe('evidence', () => {
  it('shows source, status and age on every incident, never "confirmed"', () => {
    render(<EvidenceChips incident={flood()} nowS={300} />);
    expect(screen.getByText('Corroborated (2 devices)')).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();
    expect(screen.getByText('2 min')).toBeTruthy();
    expect(screen.queryByText(/confirmed/i)).toBeNull();
  });

  it('confidence is a word with segments, never a percentage', () => {
    const { container } = render(<ConfidenceMeter confidence="medium" />);
    expect(screen.getByText('Medium confidence')).toBeTruthy();
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe('incident queue', () => {
  beforeEach(() => {
    seed([flood(), flood({ id: 'jam-1', type: 'congestion', depth: null, congestion: 'heavy', status: 'unverified', deviceCount: 1, seq: 2, note: null })]);
    useOperator.setState({ token: 'dev-token', dialogOpen: false });
  });

  it('groups by status and renders reporter notes as plain text', () => {
    wrap(<IncidentQueue selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Corroborated (1)')).toBeTruthy();
    expect(screen.getByText('Unverified (1)')).toBeTruthy();
    expect(screen.getByText('Verified (0)')).toBeTruthy();
    expect(screen.getByText('<b>Water</b> up to the knee')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });

  it('Verify updates optimistically and rolls back with a toast when the request fails', async () => {
    let reject!: (e: unknown) => void;
    vi.spyOn(api, 'incidentAction').mockImplementation(() => new Promise((_, r) => (reject = r)));
    wrap(<IncidentQueue selectedId={null} onSelect={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Verify' })[0]!);
    await waitFor(() => expect(screen.getByText('Verified (1)')).toBeTruthy());
    expect(useLiveStore.getState().sync.incidents['flood-1']!.status).toBe('corroborated');
    expect(useLiveStore.getState().pulses['flood-1']).toBe(1);
    await act(async () => reject(new ApiError('INTERNAL', 'Server error', 500)));
    await waitFor(() => expect(screen.getByText('Corroborated (1)')).toBeTruthy());
    expect(screen.getByText('Could not verify this incident: Server error. Change undone.')).toBeTruthy();
  });

  it('asks for the operator token instead of acting without one', () => {
    useOperator.setState({ token: null, dialogOpen: false });
    const spy = vi.spyOn(api, 'incidentAction');
    wrap(<IncidentQueue selectedId={null} onSelect={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]!);
    expect(useOperator.getState().dialogOpen).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the empty state copy', () => {
    seed([]);
    wrap(<IncidentQueue selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('No incidents yet. Press Play to start the simulated scenario.')).toBeTruthy();
  });
});
