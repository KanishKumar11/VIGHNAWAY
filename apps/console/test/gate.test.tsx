import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleGate } from '@/components/account/ConsoleGate';
import { AccountMenu } from '@/components/account/AccountMenu';
import { setCurrentLang, t } from '@/i18n';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { resetAuth, signInAs, stubFetch } from './authHelpers';

/** What /console shows to whom. The server still enforces every operator action. */

const wrap = () =>
  render(
    <ConsoleGate>
      <div data-testid="control-room">operator controls</div>
    </ConsoleGate>,
  );

beforeEach(() => {
  resetAuth();
  stubFetch(() => undefined);
});
afterEach(() => {
  cleanup();
  useSession.getState().clear();
  vi.unstubAllGlobals();
  setCurrentLang('en');
});

describe('control room gate', () => {
  it('shows the sign-in, and the labelled demo token alternative, when signed out', async () => {
    wrap();
    expect(await screen.findByRole('heading', { name: t.gate.title })).toBeTruthy();
    expect(screen.getByLabelText(t.account.emailLabel)).toBeTruthy();
    expect(screen.queryByTestId('control-room')).toBeNull();
    // The scripted demo path still exists, clearly labelled.
    fireEvent.click(screen.getByRole('button', { name: t.gate.demoAccess }));
    expect(useOperator.getState().dialogOpen).toBe(true);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t.operator.dialogTitle)).toBeTruthy();
    expect(t.operator.dialogTitle).toBe('Demo access (operator token)');
  });

  it('tells a signed-in citizen why not, offers sign-out and /report, and renders no controls', async () => {
    signInAs('citizen');
    wrap();
    expect(await screen.findByRole('heading', { name: t.gate.citizenTitle })).toBeTruthy();
    expect(t.gate.citizenTitle).toBe('This account can report incidents but cannot run the control room');
    expect(screen.queryByTestId('control-room')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${t.account.signOut}`) })).toBeTruthy();
    expect(screen.getByRole('link', { name: t.gate.reportLink }).getAttribute('href')).toBe('/report');
    // No sign-in form and no operator-token door for someone who is already signed in.
    expect(screen.queryByLabelText(t.account.emailLabel)).toBeNull();
  });

  it('a citizen who also has the demo token reaches the control room through the token', async () => {
    signInAs('citizen');
    window.sessionStorage.setItem('vighnaway.operatorToken', 'demo-token');
    wrap();
    expect(await screen.findByTestId('control-room')).toBeTruthy();
  });

  it.each(['operator', 'admin'] as const)('shows the control room to a %s session', async (role) => {
    signInAs(role);
    wrap();
    expect(await screen.findByTestId('control-room')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: t.gate.title })).toBeNull();
  });

  it('shows the control room to the legacy demo token, read from sessionStorage', async () => {
    window.sessionStorage.setItem('vighnaway.operatorToken', 'demo-token');
    wrap();
    expect(await screen.findByTestId('control-room')).toBeTruthy();
  });

  it('falls back to the sign-in when the session is rejected', async () => {
    signInAs('operator');
    wrap();
    expect(await screen.findByTestId('control-room')).toBeTruthy();
    useSession.getState().clear();
    expect(await screen.findByRole('heading', { name: t.gate.title })).toBeTruthy();
  });

  it('reads in Hindi and Marathi', () => {
    for (const lang of ['hi', 'mr'] as const) {
      setCurrentLang(lang);
      expect(t.gate.title).toMatch(/[ऀ-ॿ]/);
      expect(t.gate.citizenTitle).toMatch(/[ऀ-ॿ]/);
    }
  });
});

describe('account menu', () => {
  it('shows email, role badge and Sign out, and signing out clears the session', async () => {
    signInAs('admin');
    render(<AccountMenu />);
    expect(await screen.findByText('admin@example.org')).toBeTruthy();
    expect(screen.getByTestId('role-badge').textContent).toBe(t.account.roles.admin);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.account.signOut}`) }));
    expect(useSession.getState().token).toBeNull();
    expect(await screen.findByRole('link', { name: t.account.signIn })).toBeTruthy();
  });
});
