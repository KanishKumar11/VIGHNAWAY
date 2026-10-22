import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Incident } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { api, ApiError } from '@/lib/api';
import { useIncidentPhotos } from '@/hooks/useIncidentPhotos';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { IncidentQueue } from '@/components/console/IncidentQueue';
import { makeIncident, scenarioEvent } from './helpers';

const SID = andheriScenario.id;
const point = scenarioEvent(andheriScenario, 'ev02-knee').report.point;
const flood = (over: Partial<Incident> = {}): Incident =>
  makeIncident({ id: 'flood-1', type: 'flood', depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, point, seq: 1, lastReportAtS: 180, updatedAtS: 180, ...over });

const photo = (reportId: string, incidentId: string | null, atS: number) => ({ reportId, incidentId, atS, sizeBytes: 1200 });
const LIST = [photo('r4', 'flood-1', 290), photo('r3', 'flood-1', 240), photo('r2', 'other', 200), photo('r1', 'flood-1', 180), photo('r0', null, 100)];

function seed(incidents: Incident[]) {
  useLiveStore.setState({ optimistic: {}, confirmed: {}, pulses: {}, ticker: [] });
  useLiveStore.getState().applyReset({ scenarioId: SID, runId: 'x', seq: 0 });
  useLiveStore.getState().applySnapshot({ scenarioId: SID, seq: incidents.length, full: true, runId: 'run-1', simTimeS: 300, incidents });
}

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

let created: string[];
let revoked: string[];
const urlApi = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } } });
  created = [];
  revoked = [];
  // jsdom has no object URLs.
  urlApi.createObjectURL = () => {
    const u = `blob:photo-${created.length + 1}`;
    created.push(u);
    return u;
  };
  urlApi.revokeObjectURL = (u) => void revoked.push(u);
  useOperator.setState({ token: 'dev-token', dialogOpen: false });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  delete urlApi.createObjectURL;
  delete urlApi.revokeObjectURL;
  useOperator.setState({ token: null, dialogOpen: false });
});

describe('useIncidentPhotos', () => {
  it('groups the operator photo list by incident, newest first, and skips photos without an incident', async () => {
    const spy = vi.spyOn(api, 'photos').mockResolvedValue({ photos: LIST });
    const { result } = renderHook(() => useIncidentPhotos(), { wrapper });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe(SID);
    expect(spy.mock.calls[0]![1]).toBe('dev-token');
    expect(result.current.get('flood-1')!.map((p) => p.reportId)).toEqual(['r4', 'r3', 'r1']);
    expect(result.current.get('other')!.map((p) => p.reportId)).toEqual(['r2']);
  });

  it('makes no request and returns nothing while the controls are locked', async () => {
    useOperator.setState({ token: null });
    const spy = vi.spyOn(api, 'photos').mockResolvedValue({ photos: LIST });
    const { result } = renderHook(() => useIncidentPhotos(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('reads as empty, without throwing, when the server refuses the list', async () => {
    const spy = vi.spyOn(api, 'photos').mockRejectedValue(new ApiError('UNAUTHORIZED', 'No', 401));
    const { result } = renderHook(() => useIncidentPhotos(), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});

describe('photos in the incident queue', () => {
  beforeEach(() => {
    seed([flood(), flood({ id: 'jam-1', type: 'congestion', depth: null, congestion: 'heavy', status: 'unverified', seq: 2 })]);
    vi.spyOn(api, 'photoBlob').mockImplementation(async () => new Blob(['jpeg'], { type: 'image/jpeg' }));
  });

  it('shows three thumbnails with a +N tile and a label with the age', async () => {
    vi.spyOn(api, 'photos').mockResolvedValue({ photos: LIST });
    render(<IncidentQueue selectedId={null} onSelect={() => {}} />, { wrapper });
    const group = await screen.findByRole('group', { name: 'Photos from reports' });
    // 300 s now: r4 is 10 s old, r3 1 min, r1 2 min.
    expect(await screen.findByRole('button', { name: 'Photo from a report, just now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Photo from a report, 1 min ago' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Photo from a report, 2 min ago' })).toBeTruthy();
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
    await waitFor(() => expect(group.querySelectorAll('img')).toHaveLength(3));
    expect(group.querySelector('img')!.getAttribute('src')).toMatch(/^blob:photo-/);
  });

  it('adds +N when an incident has more than three photos', async () => {
    vi.spyOn(api, 'photos').mockResolvedValue({
      photos: [photo('a', 'flood-1', 290), photo('b', 'flood-1', 280), photo('c', 'flood-1', 270), photo('d', 'flood-1', 260), photo('e', 'flood-1', 250)],
    });
    render(<IncidentQueue selectedId={null} onSelect={() => {}} />, { wrapper });
    const more = await screen.findByRole('button', { name: 'Show 2 more photos' });
    expect(more.textContent).toBe('+2');
    fireEvent.click(more);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Photo 4 of 5');
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(dialog.textContent).toContain('Photo 5 of 5');
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(dialog.textContent).toContain('Photo 1 of 5');
  });

  it('opens a larger view with the caption and the privacy note, and closes on Escape', async () => {
    vi.spyOn(api, 'photos').mockResolvedValue({ photos: [photo('r1', 'flood-1', 180)] });
    render(<IncidentQueue selectedId={null} onSelect={() => {}} />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Photo from a report, 2 min ago' }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo from a citizen report' });
    expect(dialog.textContent).toContain('Report time:');
    expect(dialog.textContent).toContain('2 min ago');
    expect(dialog.textContent).toContain('Only operators can see photos. Do not share them.');
    await waitFor(() => expect(dialog.querySelector('img')?.getAttribute('src')).toMatch(/^blob:photo-/));
    expect(dialog.querySelector('img')!.getAttribute('alt')).toBe('Photo from a report, 2 min ago');
    // The image is the only thing built from the photo: no markup comes from it.
    expect(dialog.querySelectorAll('img')).toHaveLength(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('revokes the object URLs when the queue unmounts', async () => {
    vi.spyOn(api, 'photos').mockResolvedValue({ photos: [photo('r1', 'flood-1', 180)] });
    const { unmount } = render(<IncidentQueue selectedId={null} onSelect={() => {}} />, { wrapper });
    await waitFor(() => expect(created.length).toBeGreaterThan(0));
    unmount();
    expect(revoked).toEqual(expect.arrayContaining(created));
  });

  it('shows nothing about photos and asks for none while the controls are locked', async () => {
    useOperator.setState({ token: null });
    const spy = vi.spyOn(api, 'photos').mockResolvedValue({ photos: LIST });
    render(<IncidentQueue selectedId={null} onSelect={() => {}} />, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Photos from reports' })).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});
