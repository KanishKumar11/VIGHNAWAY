import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from '@/components/account/SignInForm';
import { setCurrentLang, t } from '@/i18n';
import { useSession } from '@/stores/session';
import { apiError, makeSession, resetAuth, stubFetch } from './authHelpers';

beforeEach(() => resetAuth());
afterEach(() => {
  cleanup();
  useSession.getState().clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setCurrentLang('en');
});

const emailBox = () => screen.getByLabelText(t.account.emailLabel) as HTMLInputElement;
const codeBox = () => screen.getByLabelText(t.account.codeLabel) as HTMLInputElement;

async function toCodeStep(resendAfterS = 30) {
  fireEvent.change(emailBox(), { target: { value: ' Rider@Example.org ' } });
  fireEvent.click(screen.getByRole('button', { name: t.account.sendCode }));
  await screen.findByLabelText(t.account.codeLabel);
  return resendAfterS;
}

describe('sign-in form', () => {
  it('goes email, then code, then signed in; the request names the web client', async () => {
    const session = makeSession('citizen', { user: { id: 'u1', email: 'rider@example.org', role: 'citizen', displayName: 'Rider' } });
    const { calls } = stubFetch((c) => {
      if (c.path === '/auth/otp/request') return { body: { sent: true, expiresInS: 600, resendAfterS: 30 } };
      if (c.path === '/auth/otp/verify') return { body: session };
      return undefined;
    });
    const onSignedIn = vi.fn();
    render(<SignInForm onSignedIn={onSignedIn} />);
    // Focus starts in the email field.
    expect(document.activeElement).toBe(emailBox());
    await toCodeStep();
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/otp/request', body: { email: 'rider@example.org', client: 'web' } });
    expect(screen.getByText(t.account.codeSent('rider@example.org', 10))).toBeTruthy();
    // The code field takes focus and is set up for one-time codes.
    expect(document.activeElement).toBe(codeBox());
    expect(codeBox().getAttribute('autocomplete')).toBe('one-time-code');
    expect(codeBox().getAttribute('inputmode')).toBe('numeric');
    // The name field says when it is used.
    expect(screen.getByText(t.account.nameHint)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.account.nameLabel), { target: { value: 'Rider' } });
    fireEvent.change(codeBox(), { target: { value: '123456' } });
    fireEvent.submit(codeBox().closest('form')!);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(calls[1]).toMatchObject({ path: '/auth/otp/verify', body: { email: 'rider@example.org', code: '123456', client: 'web', displayName: 'Rider' } });
    expect(useSession.getState()).toMatchObject({ token: session.token, hydrated: true });
    expect(useSession.getState().user?.email).toBe('rider@example.org');
  });

  it('leaves displayName out when it is blank', async () => {
    const { calls } = stubFetch((c) =>
      c.path === '/auth/otp/request' ? { body: { sent: true, expiresInS: 600, resendAfterS: 0 } } : c.path === '/auth/otp/verify' ? { body: makeSession('citizen') } : undefined,
    );
    render(<SignInForm />);
    await toCodeStep();
    fireEvent.change(codeBox(), { target: { value: '000111' } });
    fireEvent.submit(codeBox().closest('form')!);
    await waitFor(() => expect(useSession.getState().token).not.toBeNull());
    expect(calls[1]!.body).toEqual({ email: 'rider@example.org', code: '000111', client: 'web' });
  });

  it('shows the same generic message for any wrong, expired or used code, and clears the field', async () => {
    stubFetch((c) =>
      c.path === '/auth/otp/request' ? { body: { sent: true, expiresInS: 600, resendAfterS: 30 } } : apiError(401, 'UNAUTHORIZED', 'That code is not valid or has expired'),
    );
    render(<SignInForm />);
    await toCodeStep();
    fireEvent.change(codeBox(), { target: { value: '999999' } });
    fireEvent.submit(codeBox().closest('form')!);
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert.textContent).toBe(t.account.invalidCode));
    expect(codeBox().value).toBe('');
    expect(codeBox().getAttribute('aria-invalid')).toBe('true');
    expect(useSession.getState().token).toBeNull();
  });

  it('says what is wrong with an email or a short code before calling the API', async () => {
    const { fn } = stubFetch(() => undefined);
    render(<SignInForm />);
    fireEvent.change(emailBox(), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: t.account.sendCode }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.account.invalidEmail);
    expect(fn).not.toHaveBeenCalled();
  });

  it('counts down before a new code can be requested', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { calls } = stubFetch((c) => (c.path === '/auth/otp/request' ? { body: { sent: true, expiresInS: 600, resendAfterS: 3 } } : undefined));
    render(<SignInForm />);
    await toCodeStep();
    const resend = () => screen.getByRole('button', { name: /^Send a new code/ }) as HTMLButtonElement;
    expect(resend().textContent).toBe(t.account.resendIn(3));
    expect(resend().disabled).toBe(true);
    // Let the countdown's interval start before moving the clock.
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2000));
    expect(resend().textContent).toBe(t.account.resendIn(1));
    act(() => vi.advanceTimersByTime(1000));
    expect(resend().textContent).toBe(t.account.resend);
    expect(resend().disabled).toBe(false);
    fireEvent.click(resend());
    await waitFor(() => expect(calls.filter((c) => c.path === '/auth/otp/request')).toHaveLength(2));
  });

  it('turns a 429 into a visible countdown from retryAfterS', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    stubFetch(() => apiError(429, 'RATE_LIMITED', 'Slow down', { retryAfterS: 42 }));
    render(<SignInForm />);
    fireEvent.change(emailBox(), { target: { value: 'rider@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: t.account.sendCode }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.account.rateLimited(42));
    const send = screen.getByRole('button', { name: t.account.resendIn(42) }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await act(async () => {});
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('button', { name: t.account.resendIn(37) })).toBeTruthy();
  });

  it('accepts a pasted code with spaces or dashes', async () => {
    stubFetch((c) => (c.path === '/auth/otp/request' ? { body: { sent: true, expiresInS: 600, resendAfterS: 0 } } : undefined));
    render(<SignInForm />);
    await toCodeStep();
    fireEvent.paste(codeBox(), { clipboardData: { getData: () => ' 123-456 ' } });
    expect(codeBox().value).toBe('123456');
    fireEvent.change(codeBox(), { target: { value: '12a3b4567' } });
    expect(codeBox().value).toBe('123456');
  });

  it('shows the server message for a disabled account (403)', async () => {
    let n = 0;
    stubFetch((c) => {
      if (c.path === '/auth/otp/request') return { body: { sent: true, expiresInS: 600, resendAfterS: 0 } };
      return n++ === 0 ? apiError(403, 'FORBIDDEN', 'This account is disabled') : undefined;
    });
    render(<SignInForm />);
    await toCodeStep();
    fireEvent.change(codeBox(), { target: { value: '123456' } });
    fireEvent.submit(codeBox().closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe(t.account.generic('This account is disabled'));
  });

  it('can go back to change the email', async () => {
    stubFetch((c) => (c.path === '/auth/otp/request' ? { body: { sent: true, expiresInS: 600, resendAfterS: 0 } } : undefined));
    render(<SignInForm />);
    await toCodeStep();
    fireEvent.click(screen.getByRole('button', { name: t.account.changeEmail }));
    expect(emailBox().value).toBe('rider@example.org');
  });
});
