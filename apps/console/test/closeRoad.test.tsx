import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClosureRequestSchema, ClosureResponseSchema, findForbiddenWords } from '@vighnaway/contracts';
import { CloseRoadCard } from '@/components/console/CloseRoadCard';
import { setCurrentLang, t } from '@/i18n';
import { api } from '@/lib/api';
import { useOperator } from '@/stores/operator';

// The map is not what is tested here: stand in a button that "taps" a point on the road.
vi.mock('@/components/map/MapPanel', () => ({
  MapPanel: ({ onPick, marks = [] }: { onPick?: (p: { lat: number; lng: number }) => void; marks?: readonly unknown[] }) => (
    <button type="button" data-testid="map-tap" data-marks={marks.length} onClick={() => onPick?.({ lat: 19.124 + Math.random() / 1e5, lng: 72.85 })}>
      tap
    </button>
  ),
}));

/** P2-6: the operator taps points along a road, the matched roads are previewed by themselves, then the operator confirms. */

const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
const preview = { edgeIds: ['a-b-0', 'b-a-0'], roadNames: ['Andheri Subway'], lengthM: 120 };

beforeEach(() => {
  useOperator.setState({ token: 'demo-token' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useOperator.setState({ token: null });
  setCurrentLang('en');
});

describe('closure contract', () => {
  it('needs at least two points, bounds them, and is strict', () => {
    const p = { lat: 19.12, lng: 72.85 };
    expect(ClosureRequestSchema.safeParse({ polyline: [p] }).success).toBe(false);
    expect(ClosureRequestSchema.safeParse({ polyline: [p, p] }).success).toBe(true);
    expect(ClosureRequestSchema.parse({ polyline: [p, p] }).confirm).toBe(false);
    expect(ClosureRequestSchema.safeParse({ polyline: Array(21).fill(p) }).success).toBe(false);
    expect(ClosureRequestSchema.safeParse({ polyline: [p, p], status: 'verified' }).success).toBe(false);
    expect(ClosureResponseSchema.safeParse({ preview, incident: null }).success).toBe(true);
  });
});

describe('Close a road', () => {
  it('is offered only with an operator credential', () => {
    useOperator.setState({ token: null });
    const { container } = render(wrap(<CloseRoadCard />));
    expect(container.textContent).toBe('');
  });

  it('shows every tapped point, previews by itself at two points (nothing created), then confirms the same line', async () => {
    const closeRoad = vi.spyOn(api, 'closeRoad').mockImplementation(async (_id, body) => ({
      preview,
      incident: body.confirm ? ({ id: 'inc-op', type: 'closure' } as never) : null,
    }));
    render(wrap(<CloseRoadCard />));
    fireEvent.click(screen.getByTestId('close-road-open'));
    expect(screen.getByTestId('close-road-step').textContent).toBe(t.closeRoad.tapMore(0));
    // One point is not a line: nothing is asked and Close stays disabled, and the step says what to do next.
    fireEvent.click(screen.getByTestId('map-tap'));
    expect(screen.getByTestId('map-tap').dataset.marks).toBe('1');
    expect(screen.getByTestId('close-road-step').textContent).toBe(t.closeRoad.tapMore(1));
    expect((screen.getByTestId('close-road-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('map-tap'));
    expect(screen.getByTestId('map-tap').dataset.marks).toBe('2');
    const shown = await screen.findByTestId('close-road-preview');
    expect(shown.textContent).toContain('Andheri Subway');
    expect(shown.textContent).toContain('120 m');
    expect(closeRoad).toHaveBeenCalledTimes(1);
    expect(closeRoad.mock.calls[0]![1]).toMatchObject({ confirm: false });
    expect(closeRoad.mock.calls[0]![1].polyline).toHaveLength(2);

    const confirm = screen.getByTestId('close-road-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(closeRoad).toHaveBeenCalledTimes(2));
    expect(closeRoad.mock.calls[1]![1]).toMatchObject({ confirm: true });
    expect(closeRoad.mock.calls[1]![1].polyline).toEqual(closeRoad.mock.calls[0]![1].polyline);
  });

  it('a new point after a preview drops it until the new line is matched, so a stale match is never confirmed', async () => {
    vi.spyOn(api, 'closeRoad').mockResolvedValue({ preview, incident: null });
    render(wrap(<CloseRoadCard />));
    fireEvent.click(screen.getByTestId('close-road-open'));
    fireEvent.click(screen.getByTestId('map-tap'));
    fireEvent.click(screen.getByTestId('map-tap'));
    await screen.findByTestId('close-road-preview');
    fireEvent.click(screen.getByTestId('map-tap'));
    expect(screen.queryByTestId('close-road-preview')).toBeNull();
    expect((screen.getByTestId('close-road-confirm') as HTMLButtonElement).disabled).toBe(true);
    await screen.findByTestId('close-road-preview');
  });

  it('Start again clears every point and the preview', async () => {
    vi.spyOn(api, 'closeRoad').mockResolvedValue({ preview, incident: null });
    render(wrap(<CloseRoadCard />));
    fireEvent.click(screen.getByTestId('close-road-open'));
    fireEvent.click(screen.getByTestId('map-tap'));
    fireEvent.click(screen.getByTestId('map-tap'));
    await screen.findByTestId('close-road-preview');
    fireEvent.click(screen.getByTestId('close-road-clear'));
    expect(screen.getByTestId('map-tap').dataset.marks).toBe('0');
    expect(screen.queryByTestId('close-road-preview')).toBeNull();
    expect(screen.getByTestId('close-road-step').textContent).toBe(t.closeRoad.tapMore(0));
  });

  it('shows the server message when the line is not on a road', async () => {
    const { ApiError } = await import('@/lib/api');
    vi.spyOn(api, 'closeRoad').mockRejectedValue(new ApiError('NOT_ON_ROAD', 'The line does not follow a known road', 422));
    render(wrap(<CloseRoadCard />));
    fireEvent.click(screen.getByTestId('close-road-open'));
    fireEvent.click(screen.getByTestId('map-tap'));
    fireEvent.click(screen.getByTestId('map-tap'));
    expect((await screen.findByRole('alert')).textContent).toContain('does not follow a known road');
    expect((screen.getByTestId('close-road-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads in all three languages with no forbidden words', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setCurrentLang(lang);
      const text = Object.values(t.closeRoad)
        .map((v) => (typeof v === 'function' ? (v as (...a: never[]) => string)(...([1, 2, 3].slice(0, v.length) as never[])) : v))
        .join(' ');
      expect(findForbiddenWords(text)).toEqual([]);
    }
  });
});
