import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findForbiddenWords, type HospitalStatesResponse, type HospitalStateValue } from '@vighnaway/contracts';
import { HospitalLoadCard } from '@/components/console/HospitalLoadCard';
import { tripEnv } from '@/hooks/useDemoTrip';
import { setCurrentLang, t } from '@/i18n';
import { api } from '@/lib/api';
import { assignCallers, statesOf } from '@/lib/hospitals';
import { useOperator } from '@/stores/operator';

/** P2-4.c: the console shows operator-set hospital states and where simulated callers are sent, and why. */

const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
const NAMES: Record<string, string> = { 'hosp-hbt': 'HBT Trauma Hospital', 'hosp-holy-spirit': 'Holy Spirit Hospital', 'hosp-kokilaben': 'Kokilaben Hospital' };
const response = (states: Record<string, HospitalStateValue> = {}): HospitalStatesResponse => ({
  scenarioId: 'andheri-monsoon',
  simulated: true,
  hospitals: Object.keys(NAMES).map((placeId) => ({
    placeId,
    name: NAMES[placeId]!,
    state: states[placeId] ?? 'accepting',
    setAtS: states[placeId] ? 60 : null,
    setBy: states[placeId] ? ('operator' as const) : null,
  })),
});

beforeEach(() => {
  useOperator.setState({ token: 'demo-token' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useOperator.setState({ token: null });
  setCurrentLang('en');
});

describe('assignCallers', () => {
  it('is deterministic and never sends a caller to a diverting hospital when another is reachable', () => {
    const env = tripEnv();
    const open = assignCallers(env, [], 0, {});
    expect(assignCallers(env, [], 0, {})).toEqual(open);
    expect(open).toHaveLength(3);
    expect(open.every((a) => a.placeId !== null)).toBe(true);
    const first = open[0]!.placeId!;
    const diverted = assignCallers(env, [], 0, { [first]: 'diverting' });
    expect(diverted.every((a) => a.placeId !== first)).toBe(true);
    expect(diverted[0]!.reason).toBe('spread');
    expect(diverted[0]!.passedOver).toMatchObject({ placeId: first, state: 'diverting' });
  });

  it('statesOf leaves out accepting hospitals', () => {
    expect(statesOf(response({ 'hosp-hbt': 'busy' }))).toEqual({ 'hosp-hbt': 'busy' });
    expect(statesOf(undefined)).toEqual({});
  });
});

describe('Hospital load', () => {
  it('lists each hospital as accepting by default and the three simulated callers', async () => {
    vi.spyOn(api, 'hospitals').mockResolvedValue(response());
    render(wrap(<HospitalLoadCard />));
    fireEvent.click(screen.getByTestId('hospital-load-open'));
    const list = await screen.findByTestId('hospital-states');
    for (const name of Object.values(NAMES)) expect(list.textContent).toContain(name);
    expect(list.textContent).toContain(t.hospitals.notSet);
    await waitFor(() => expect(screen.getByTestId('hospital-assignments').children).toHaveLength(3));
    expect(screen.getByText(t.hospitals.footnote)).toBeTruthy();
  });

  it('an operator marks a hospital diverting: the call carries the state, and the callers move elsewhere', async () => {
    const env = tripEnv();
    const nearest = assignCallers(env, [], 0, {})[0]!.placeId!;
    let current = response();
    vi.spyOn(api, 'hospitals').mockImplementation(async () => current);
    const set = vi.spyOn(api, 'setHospital').mockImplementation(async (_id, placeId, state) => {
      current = response({ [placeId]: state });
      return current;
    });
    render(wrap(<HospitalLoadCard />));
    fireEvent.click(screen.getByTestId('hospital-load-open'));
    fireEvent.click(await screen.findByTestId(`hospital-${nearest}-diverting`));
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set.mock.calls[0]![1]).toBe(nearest);
    expect(set.mock.calls[0]![2]).toBe('diverting');
    await waitFor(() => expect(screen.getByTestId(`hospital-${nearest}-diverting`).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByTestId('hospital-states').textContent).toContain(t.hospitals.setBy);
    const text = screen.getByTestId('hospital-assignments').textContent ?? '';
    expect(text).not.toContain(`: ${NAMES[nearest]}`);
    expect(text).toContain(t.hospitals.states.diverting.toLowerCase());
  });

  it('without an operator credential the buttons are disabled and a hint says why', async () => {
    useOperator.setState({ token: null });
    vi.spyOn(api, 'hospitals').mockResolvedValue(response());
    render(wrap(<HospitalLoadCard />));
    fireEvent.click(screen.getByTestId('hospital-load-open'));
    const button = (await screen.findByTestId('hospital-hosp-hbt-busy')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(t.hospitals.operatorOnly)).toBeTruthy();
  });

  it('shows the error when the states cannot be loaded', async () => {
    vi.spyOn(api, 'hospitals').mockRejectedValue(new Error('offline'));
    render(wrap(<HospitalLoadCard />));
    fireEvent.click(screen.getByTestId('hospital-load-open'));
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
  });

  it('has Hindi and Marathi text without a forbidden word', () => {
    for (const lang of ['en', 'hi', 'mr'] as const) {
      setCurrentLang(lang);
      const h = t.hospitals;
      const all = [h.open, h.title, h.intro(3), h.setBy, h.notSet, ...Object.values(h.states), h.operatorOnly, h.assignmentsTitle, h.reasonNearest, h.passedState('X', 'Y'), h.passedLoad('X', 2), h.footnote];
      for (const text of all) expect(findForbiddenWords(text)).toEqual([]);
    }
  });
});
