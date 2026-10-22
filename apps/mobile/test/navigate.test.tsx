import { fireEvent, render, screen } from '@testing-library/react-native';
import { enterFixture, leaveFixture } from '@/fixtures/hero';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

describe('Navigate screen (fixture data, no Google key in tests)', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    leaveFixture();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const { NavigateScreen } = require('@/features/navigate/NavigateScreen') as typeof import('@/features/navigate/NavigateScreen');

  it('renders the route-change hero: banner, peek, labelled schematic fallback, fixture label', async () => {
    enterFixture('change');
    await render(<NavigateScreen />);
    // The banner shows the triggering incident with its evidence; the engine's full sentence is its spoken label.
    expect(screen.getByTestId('change-banner-message')).toHaveTextContent('Flooding (knee deep) at Andheri Subway');
    expect(screen.getByLabelText(/^Route changed\. Flooding \(knee deep\) at Andheri Subway/)).toBeTruthy();
    expect(screen.getByText('What to do now')).toBeTruthy();
    expect(screen.getByTestId('peek-card')).toBeTruthy();
    expect(screen.getByTestId('peek-eta')).toHaveTextContent(/min left$/);
    // Map fallback and fixture state merge into one compact status pill (DESIGN.md 11.1); the
    // schematic legend chip is always visible, and the full notices expand from the pill.
    expect(screen.getByText('Schematic view, not a map')).toBeTruthy();
    expect(screen.getByTestId('status-pill')).toHaveTextContent(/^Fixture\+1/);
    expect(screen.queryByText('Map unavailable: check the Google Maps key or the network')).toBeNull();
    await fireEvent.press(screen.getByTestId('status-pill'));
    expect(screen.getByText('Map unavailable: check the Google Maps key or the network')).toBeTruthy();
    expect(screen.getByText('Schematic view of the road graph, not a map')).toBeTruthy();
    expect(screen.getByText('Fixture data for design review')).toBeTruthy();
    expect(screen.getAllByText('Simulated').length).toBeGreaterThan(0);
    expect(screen.getByText('Report')).toBeTruthy();
    // The bundled graph is the OpenStreetMap extract, so the attribution line names OpenStreetMap.
    expect(screen.getAllByText('Road data © OpenStreetMap contributors').length).toBeGreaterThan(0);
  });
});
