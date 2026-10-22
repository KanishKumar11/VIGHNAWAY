import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { createRef } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { DestinationSheet } from '@/features/navigate/DestinationSheet';
import { kindOf, parsePhoton, searchOnline, searchUrl, ONLINE_LIMIT, type OnlinePlace } from '@/features/search/onlineSearch';
import { RECENT_MAX, useRecentPlaces } from '@/features/search/recent';
import { SEARCH_DEBOUNCE_MS, useOnlineSearch } from '@/features/search/useOnlineSearch';
import { useConnection } from '@/stores/connection';
import { useScenario } from '@/stores/scenario';
import { useTrip } from '@/stores/trip';

/** The shape Photon answers with (trimmed from a real "ambala cantt station" lookup). */
const feature = (name: string, lng: number, lat: number, props: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { name, countrycode: 'IN', state: 'Haryana', ...props },
});
const photon = {
  features: [
    feature('Ambala Cantt. Yard Terminal', 76.7906, 30.3805, { osm_key: 'railway', osm_value: 'station', street: 'Grand Trunk Road', city: 'Ambala' }),
    feature('Ambala Air Force Station', 76.8179, 30.3718, { osm_key: 'aeroway', osm_value: 'aerodrome', street: 'Grand Trunk Road', city: 'Jandli' }),
    // The same station again as a second OSM object: one result.
    feature('Ambala Air Force Station', 76.8179, 30.3718, { osm_key: 'military', osm_value: 'airfield' }),
    feature('Somewhere in London', -0.12, 51.5, { osm_key: 'place', osm_value: 'city' }),
    { type: 'Feature', geometry: { type: 'Point', coordinates: ['x', 'y'] }, properties: { name: 'Broken' } },
    feature('  <b>Evil</b>\u0000 Name  ', 76.77, 30.38, { osm_key: 'shop', osm_value: 'mall', street: 'GT Road', housenumber: '12' }),
  ],
};

describe('parsePhoton', () => {
  const places = parsePhoton(photon);

  it('keeps real places with their addresses and drops what is not in India, malformed or repeated', () => {
    expect(places.map((p) => p.name)).toEqual(['Ambala Cantt. Yard Terminal', 'Ambala Air Force Station', '<b>Evil</b> Name']);
    expect(places[0]).toMatchObject({ subtitle: 'Grand Trunk Road, Ambala, Haryana', kind: 'station', id: 'place:30.38050:76.79060' });
    expect(places[1]).toMatchObject({ kind: 'airport', subtitle: 'Grand Trunk Road, Jandli, Haryana' });
  });

  it('is plain text: control characters and extra spaces go, markup is left as text for React to escape', () => {
    expect(places[2]!.name).toBe('<b>Evil</b> Name');
    expect(places[2]!.subtitle).toBe('12 GT Road, Haryana');
  });

  it('returns nothing for a bad answer and never more than the limit', () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: 'no' })).toEqual([]);
    const many = { features: Array.from({ length: 30 }, (_, i) => feature(`Place ${i}`, 76 + i / 100, 30.3, { osm_key: 'amenity', osm_value: 'cafe' })) };
    expect(parsePhoton(many)).toHaveLength(ONLINE_LIMIT);
  });

  it('maps OpenStreetMap tags to a kind', () => {
    expect(kindOf('place', 'city')).toBe('city');
    expect(kindOf('place', 'hamlet')).toBe('village');
    expect(kindOf('highway', 'primary')).toBe('road');
    expect(kindOf('amenity', 'hospital')).toBe('hospital');
    expect(kindOf('amenity', 'cafe')).toBe('poi');
    expect(kindOf('tourism', 'museum')).toBe('landmark');
    expect(kindOf('nothing', 'x')).toBe('poi');
  });
});

describe('searchUrl and searchOnline', () => {
  it('rounds the bias to about 10 km, limits to India and encodes the text', () => {
    const url = searchUrl('https://geo.example', ' ambala & co ', { lat: 30.38437, lng: 76.77042 });
    expect(url).toContain('q=ambala%20%26%20co');
    expect(url).toContain('lat=30.4&lon=76.8');
    expect(url).toContain('bbox=68.1,6.7,97.4,35.7');
    expect(url).not.toContain('30.38437');
    expect(searchUrl('https://geo.example', 'x', null)).not.toContain('lat=');
  });

  it('parses the answer, and throws on an HTTP error so the sheet can fall back', async () => {
    const ok = jest.fn(async () => ({ ok: true, json: async () => photon }) as never);
    expect(await searchOnline('ambala', null, undefined, 'https://geo.example', ok as never)).toHaveLength(3);
    const bad = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as never);
    await expect(searchOnline('ambala', null, undefined, 'https://geo.example', bad as never)).rejects.toThrow('503');
    expect(await searchOnline('ambala', null, undefined, '', ok as never)).toEqual([]);
  });
});

describe('recent places', () => {
  const p = (n: number) => ({ id: `place:${n}`, name: `P${n}`, subtitle: '', kind: 'poi' as const, point: { lat: 30 + n / 100, lng: 76 } });
  beforeEach(() => useRecentPlaces.getState().clear());

  it('keeps the newest first, never repeats a place and caps the list', () => {
    for (let i = 0; i < RECENT_MAX + 3; i++) useRecentPlaces.getState().remember(p(i));
    useRecentPlaces.getState().remember(p(5));
    const ids = useRecentPlaces.getState().places.map((x) => x.id);
    expect(ids).toHaveLength(RECENT_MAX);
    expect(ids[0]).toBe('place:5');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('useOnlineSearch', () => {
  const place: OnlinePlace = { id: 'place:30.38050:76.79060', name: 'Ambala', subtitle: 'Haryana', kind: 'city', point: { lat: 30.3805, lng: 76.7906 } };
  beforeEach(() => {
    jest.useFakeTimers();
    useConnection.setState({ net: 'online' });
  });
  afterEach(() => jest.useRealTimers());

  it('waits for typing to pause, asks once, and caches the answer', async () => {
    const fetcher = jest.fn(async (...args: [string, ...unknown[]]) => (args.length ? [place] : []));
    const { result, rerender } = await renderHook(({ q }: { q: string }) => useOnlineSearch(q, null, true, fetcher as never), { initialProps: { q: 'a' } });
    expect(result.current.status).toBe('idle'); // under two letters
    await rerender({ q: 'am' });
    await rerender({ q: 'amb' });
    await rerender({ q: 'amba' });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('amba');
    expect(result.current).toMatchObject({ status: 'ready', places: [place] });
    // The same text again is answered from the cache.
    await rerender({ q: 'ambal' });
    await rerender({ q: 'amba' });
    expect(result.current.status).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('says offline without asking, and says error when the server fails', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('down');
    });
    useConnection.setState({ net: 'offline' });
    const off = await renderHook(() => useOnlineSearch('ambala', null, true, fetcher as never));
    expect(off.result.current).toEqual({ status: 'offline', places: [] });
    expect(fetcher).not.toHaveBeenCalled();
    await off.unmount();

    useConnection.setState({ net: 'online' });
    const { result } = await renderHook(() => useOnlineSearch('ambala', null, true, fetcher as never));
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
    });
    expect(result.current).toEqual({ status: 'error', places: [] });
  });
});

describe('the search sheet', () => {
  const answer = (body: unknown) => jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body } as never);
  const open = async () => {
    const ref = createRef<BottomSheetModal>();
    await render(<DestinationSheet ref={ref} onChosen={jest.fn()} onDismiss={jest.fn()} />);
  };
  beforeEach(() => {
    useRecentPlaces.getState().clear();
    useConnection.setState({ net: 'online' });
    useScenario.getState().setRegion('andheri');
    useTrip.getState().resetTrip();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists live results with their addresses as you type, and marks one with no road map', async () => {
    answer(photon);
    await open();
    await fireEvent.changeText(screen.getByTestId('place-search-input'), 'ambala');
    expect(await screen.findByText('Ambala Cantt. Yard Terminal', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Grand Trunk Road, Ambala, Haryana')).toBeTruthy();
    expect(screen.getByText('Places')).toBeTruthy();
    // A result in the corridor has a road map; Bangalore-style results would show the chip.
    expect(screen.queryByTestId('no-map-place:30.38050:76.79060')).toBeNull();
    expect(screen.getByTestId('search-credit').props.children).toMatch(/Photon/);
  });

  it('says so, and keeps the built-in places, when live search cannot be reached', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    await open();
    await fireEvent.changeText(screen.getByTestId('place-search-input'), 'ambala');
    expect(await screen.findByText('Live place search is not reachable right now. Showing built-in places only.', undefined, { timeout: 3000 })).toBeTruthy();
    // The built-in Ambala (corridor city) is still offered.
    expect(screen.getAllByText('Ambala').length).toBeGreaterThan(0);
  });

  it('picking a start and a destination from live results plans the trip on the corridor map', async () => {
    answer({ features: [feature('Amritsar Junction', 74.8785, 31.6326, { osm_key: 'railway', osm_value: 'station', city: 'Amritsar' })] });
    await open();
    await fireEvent(screen.getByTestId('place-from-input'), 'focus');
    await fireEvent.changeText(screen.getByTestId('place-from-input'), 'amritsar junction');
    const from = await screen.findByText('Amritsar Junction', undefined, { timeout: 3000 });
    await fireEvent.press(from);

    answer({ features: [feature('Ambala Cantonment Junction', 76.7906, 30.3805, { osm_key: 'railway', osm_value: 'station', city: 'Ambala' })] });
    await fireEvent.changeText(screen.getByTestId('place-search-input'), 'ambala cantonment');
    const to = await screen.findByText('Ambala Cantonment Junction', undefined, { timeout: 3000 });
    await fireEvent.press(to);

    await waitFor(() => expect(useScenario.getState().region).toBe('north'));
    expect(useRecentPlaces.getState().places.map((x) => x.name)).toEqual(['Ambala Cantonment Junction', 'Amritsar Junction']);
  });

  it('refuses a result with no road map, by name, instead of failing silently', async () => {
    answer({ features: [feature('Connaught Place', 77.2167, 28.6315, { osm_key: 'place', osm_value: 'suburb', city: 'New Delhi' })] });
    await open();
    await fireEvent.changeText(screen.getByTestId('place-search-input'), 'connaught');
    const row = await screen.findByText('Connaught Place', undefined, { timeout: 3000 });
    expect(screen.getByText('No road map yet')).toBeTruthy();
    await fireEvent.press(row);
    expect(screen.getByTestId('search-notice').props.children).toBe('There is no road map for Connaught Place yet. Routes work in Andheri and from Amritsar to Ambala.');
    expect(useScenario.getState().region).toBe('andheri');
  });

  it('shows recent picks first when nothing is typed', async () => {
    useRecentPlaces.getState().remember({ id: 'place:30.38050:76.79060', name: 'Ambala Cantonment Junction', subtitle: 'Ambala, Haryana', kind: 'station', point: { lat: 30.3805, lng: 76.7906 } });
    await open();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Ambala Cantonment Junction')).toBeTruthy();
    expect(screen.getByText('Suggested')).toBeTruthy();
  });
});
