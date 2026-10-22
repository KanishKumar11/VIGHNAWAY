import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import type { Incident, RouteEvaluation } from '@vighnaway/contracts';
import { WhyCard } from '@/components/WhyCard';
import { computePlan } from '@/features/trip/planner';
import { useIncidents } from '@/stores/incidents';
import { useSettings } from '@/stores/settings';
import SettingsScreen from '../app/(drawer)/settings';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual('react') as typeof import('react');
    mockUseEffect(cb, [cb]);
  },
}));

// The real planner on the real graph is slow: capture what it is asked instead.
const mockPlanTrip = jest.fn((_input: unknown) => ({ routes: [], recommendedRouteId: null }));
jest.mock('@vighnaway/engine', () => {
  const actual = jest.requireActual('@vighnaway/engine');
  return { ...actual, planTrip: (input: unknown) => mockPlanTrip(input), replanFrom: (input: unknown) => mockPlanTrip(input) };
});

/** P2-9 (phone): "Prefer well-lit roads" is a walking preference, off by default, passed to the engine only when it applies. */

const concern = { id: 'wc-1', type: 'walking_concern', status: 'unverified' } as unknown as Incident;
const flood = { id: 'fl-1', type: 'flood', status: 'unverified' } as unknown as Incident;

beforeEach(() => {
  mockPlanTrip.mockClear();
  useSettings.setState({ profile: 'car', preferLit: false });
  useIncidents.setState({ byId: { 'wc-1': concern, 'fl-1': flood } });
});
void useEffect;

describe('planner', () => {
  const lastInput = () => mockPlanTrip.mock.calls.at(-1)![0] as Record<string, unknown>;

  it('sends nothing about lighting by default, for a car, or when the preference is on but the profile is not walking', () => {
    computePlan();
    expect(lastInput()).not.toHaveProperty('preferLit');
    useSettings.setState({ profile: 'car', preferLit: true });
    computePlan();
    expect(lastInput()).not.toHaveProperty('preferLit');
    useSettings.setState({ profile: 'foot', preferLit: false });
    computePlan();
    expect(lastInput()).not.toHaveProperty('preferLit');
  });

  it('sends preferLit and only the walking concerns when walking with the preference on', () => {
    useSettings.setState({ profile: 'foot', preferLit: true });
    computePlan();
    const input = lastInput();
    expect(input.preferLit).toBe(true);
    expect((input.walkingConcerns as Incident[]).map((i) => i.id)).toEqual(['wc-1']);
  });
});

describe('Settings switch', () => {
  it('appears only for walking and starts off', async () => {
    useSettings.setState({ profile: 'car' });
    const view = await render(<SettingsScreen />);
    expect(screen.queryByTestId('prefer-lit')).toBeNull();
    await view.unmount();
    useSettings.setState({ profile: 'foot' });
    await render(<SettingsScreen />);
    const sw = screen.getByTestId('prefer-lit');
    expect(sw.props.value).toBe(false);
    await fireEvent(sw, 'valueChange', true);
    expect(useSettings.getState().preferLit).toBe(true);
  });
});

describe('Why card', () => {
  const route = (extra: Partial<RouteEvaluation> = {}) =>
    ({
      routeId: 'r',
      name: 'Via X',
      explanation: { reason: 'Fastest', tradeOff: '', recheckIf: 'Nothing', confidence: 'medium', confidenceReasons: ['Lighting data is missing on 3 segments of this route'] },
      ...extra,
    }) as unknown as RouteEvaluation;

  it('states the preference only when the plan was made with it, and never rates a road', async () => {
    await render(<WhyCard route={route({ lighting: { unlitCount: 0, unknownCount: 3, concernIds: [] } })} />);
    expect(screen.getByTestId('why-preference').props.children).toBe('Preference: well-lit roads');
  });

  it('says nothing about lighting when the preference is off', async () => {
    await render(<WhyCard route={route()} />);
    expect(screen.queryByTestId('why-preference')).toBeNull();
  });
});
