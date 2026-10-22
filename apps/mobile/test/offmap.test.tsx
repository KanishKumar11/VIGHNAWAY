import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { submitReport } from '@/features/report/submit';
import { useSettings } from '@/stores/settings';
import { useUi } from '@/stores/ui';

jest.mock('expo-router', () => ({
  router: { dismiss: jest.fn(), back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
  usePreventRemove: jest.fn(),
}));
jest.mock('@/features/report/submit', () => ({
  submitReport: jest.fn(async () => ({ kind: 'sent', photo: 'none', offMap: true })),
  sendPhoto: jest.fn(),
}));
const mockSubmit = submitReport as jest.Mock;

/** Amritsar: outside the Andheri map, so there is no road to snap to. */
const AMRITSAR = { lat: 31.64918, lng: 74.8572 };

const { ReportScreen } = require('@/features/report/ReportScreen') as typeof import('@/features/report/ReportScreen');

async function fillAndSend() {
  await fireEvent.press(screen.getByTestId('type-congestion'));
  await fireEvent.press(screen.getByTestId('congestion-heavy'));
  await fireEvent.press(screen.getByTestId('send-report'));
}

beforeEach(() => {
  mockSubmit.mockClear();
  useUi.setState({ mapCenter: AMRITSAR });
});

describe('report away from the mapped roads', () => {
  it('live mode: sends it as it is and says it is saved off-map and changes no route', async () => {
    useSettings.setState({ dataMode: 'live' });
    await render(<ReportScreen />);
    expect(screen.getByTestId('location-road')).toHaveTextContent(/Saved as off-map/);
    await fillAndSend();
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit.mock.calls[0][0].point).toEqual(AMRITSAR);
    expect(screen.queryByTestId('form-error')).toBeNull();
  });

  it('keeps the map centre where it is instead of jumping the pin onto an Andheri road', async () => {
    useSettings.setState({ dataMode: 'live' });
    await render(<ReportScreen />);
    expect(screen.getByTestId('location-coords')).toHaveTextContent('31.64918');
  });
});
