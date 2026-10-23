import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../app/(drawer)/settings';
import { DEFAULT_API_URL } from '@/config/env';
import { statusPill, type StatusInput } from '@/features/navigate/statusModel';
import { api, ApiRequestError } from '@/lib/api';
import { useSettings } from '@/stores/settings';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual('react') as typeof import('react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mockUseEffect(cb, [cb]);
  },
}));

const LAN = 'http://10.30.176.129:4000';
const base: StatusInput = {
  mode: 'unreachable',
  apiUrl: LAN,
  cachedAtSimS: null,
  cachedAtWallMs: null,
  clockStartsAt: '2026-07-14T09:00:00+05:30',
  localClock: false,
  fixture: false,
  nowWallMs: 0,
  mapUnavailable: false,
};

afterEach(() => {
  jest.restoreAllMocks();
  useSettings.setState({ apiUrl: DEFAULT_API_URL, dataMode: 'simulated' });
});

describe('a server address saved on the phone', () => {
  it('the unreachable notice says how to go back to the default server when a custom one is set', () => {
    const custom = statusPill(base).notices.find((n) => n.key === 'unreachable');
    expect(custom?.sub).toMatch(/Use the default server/);
    const standard = statusPill({ ...base, apiUrl: DEFAULT_API_URL }).notices.find((n) => n.key === 'unreachable');
    expect(standard?.sub).toBeUndefined();
  });

  it('an unreachable server keeps Live offered after switching to Simulated, and offers the default server', async () => {
    useSettings.setState({ apiUrl: LAN, dataMode: 'simulated' });
    jest.spyOn(api, 'scenarios').mockRejectedValue(new ApiRequestError('Network request failed', 0, null));
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('mode-hint')).toHaveTextContent(/Could not reach/));
    expect(screen.getByTestId('mode-live')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('server-use-default-data'));
    expect(useSettings.getState().apiUrl).toBe(DEFAULT_API_URL);
  });

  it('a server that answers without a live scenario still hides Live', async () => {
    useSettings.setState({ apiUrl: LAN, dataMode: 'simulated' });
    jest.spyOn(api, 'scenarios').mockResolvedValue({ scenarios: [] } as unknown as Awaited<ReturnType<typeof api.scenarios>>);
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('mode-hint')).toHaveTextContent(/not available/));
    expect(screen.queryByTestId('mode-live')).toBeNull();
  });
});
