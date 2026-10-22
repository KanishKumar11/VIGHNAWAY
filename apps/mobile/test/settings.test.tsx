import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import SettingsScreen from '../app/(drawer)/settings';
import { setPlanningPaused, schedulePlan } from '@/features/trip/planner';
import { useActiveProfile, usePlanGate } from '@/features/trip/planGate';
import * as engine from '@/lib/engine';
import { useSettings } from '@/stores/settings';

// expo-router's focus hook runs its callback when the screen is focused: here, on mount.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismiss: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: mockUseEffect } = jest.requireActual('react') as typeof import('react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mockUseEffect(cb, [cb]);
  },
}));

/** The route engine must not re-plan (or rebuild a 23,000-edge graph) behind a screen that does not show the map. */

beforeEach(() => {
  setPlanningPaused(false);
  useSettings.setState({ profile: 'car', language: 'en', dataMode: 'simulated' });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setPlanningPaused(false);
});

describe('planning pause', () => {
  // Fake timers only here: the screen tests below need real ones to render.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('does not plan while paused, and plans once when it resumes', () => {
    const getGraph = jest.spyOn(engine, 'getGraph').mockImplementation(() => {
      throw new Error('graph requested');
    });
    setPlanningPaused(true);
    schedulePlan({ delayMs: 0 });
    schedulePlan({ showEvaluating: true, delayMs: 0 });
    jest.advanceTimersByTime(2000);
    expect(getGraph).not.toHaveBeenCalled();
    setPlanningPaused(false);
    expect(() => jest.advanceTimersByTime(500)).toThrow('graph requested');
    expect(getGraph).toHaveBeenCalledTimes(1);
  });

  it('owes nothing when nothing was asked for while paused', () => {
    const getGraph = jest.spyOn(engine, 'getGraph');
    setPlanningPaused(true);
    setPlanningPaused(false);
    jest.advanceTimersByTime(2000);
    expect(getGraph).not.toHaveBeenCalled();
  });

  it('the map screens keep the profile they had while paused, then follow the setting', async () => {
    const { result } = await renderHook(() => useActiveProfile());
    expect(result.current).toBe('car');
    await act(async () => setPlanningPaused(true));
    await act(async () => useSettings.getState().setProfile('step_free'));
    expect(useSettings.getState().profile).toBe('step_free');
    expect(result.current).toBe('car');
    expect(usePlanGate.getState().paused).toBe(true);
    await act(async () => setPlanningPaused(false));
    expect(result.current).toBe('step_free');
  });
});

describe('Settings layout', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('pauses planning while it is in front and resumes when it goes away', async () => {
    const view = await render(<SettingsScreen />);
    expect(usePlanGate.getState().paused).toBe(true);
    await view.unmount();
    expect(usePlanGate.getState().paused).toBe(false);
  });

  it('shows every travel profile as a whole-word tile, and choosing one changes the setting', async () => {
    await render(<SettingsScreen />);
    for (const p of ['car', 'two_wheeler', 'foot', 'step_free']) expect(screen.getByTestId(`settings-profile-${p}`)).toBeTruthy();
    expect(screen.getByText('Two-wheeler')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-profile-step_free'));
    expect(useSettings.getState().profile).toBe('step_free');
  });

  it('puts language in one row and keeps the server address folded away until asked for', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByTestId('language-hi')).toBeTruthy();
    expect(screen.queryByLabelText('Server address')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-advanced'));
    expect(screen.getByLabelText('Server address')).toBeTruthy();
  });

  it('keeps the switches and the account entry', async () => {
    await render(<SettingsScreen />);
    for (const id of ['larger-text', 'speak-changes', 'google-traffic', 'settings-account']) expect(screen.getByTestId(id)).toBeTruthy();
  });
});
