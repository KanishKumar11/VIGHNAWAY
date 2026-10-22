import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@vighnaway/contracts';
import { AdminScreen } from '@/components/admin/AdminScreen';
import { setCurrentLang, t } from '@/i18n';
import { useSession } from '@/stores/session';
import { apiError, makeAdminUser, resetAuth, signInAs, stubFetch, type Call } from './authHelpers';

/** /admin: user management, only for an admin session. */

const admin = makeAdminUser('admin', 'admin@example.org', { id: 'u-admin', lastLoginAt: '2026-10-20T08:30:00.000Z' });
const ops = makeAdminUser('operator', 'ops@example.org');
const rider = makeAdminUser('citizen', 'rider@example.org');
const gone = makeAdminUser('citizen', 'gone@example.org', { disabled: true });

/** A tiny in-memory copy of the admin routes. */
function adminApi(over: (c: Call) => ReturnType<Parameters<typeof stubFetch>[0]> = () => undefined) {
  let users: AdminUser[] = [admin, ops, rider, gone];
  return stubFetch(async (c) => {
    const custom = await over(c);
    if (custom) return custom;
    if (c.path === '/admin/users' && c.method === 'GET') return { body: { users } };
    if (c.path === '/admin/users' && c.method === 'POST') {
      const b = c.body as { email: string; role: AdminUser['role'] };
      const created = makeAdminUser(b.role, b.email);
      users = [...users, created];
      return { status: 201, body: { user: created } };
    }
    const m = /^\/admin\/users\/(.+)$/.exec(c.path);
    if (m && c.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const next = { ...users.find((u) => u.id === id)!, ...(c.body as object) };
      users = users.map((u) => (u.id === id ? next : u));
      return { body: { user: next } };
    }
    return undefined;
  });
}

const row = (email: string) => within(screen.getByTestId(`user-${email}`));

beforeEach(() => resetAuth());
afterEach(() => {
  cleanup();
  useSession.getState().clear();
  vi.unstubAllGlobals();
  setCurrentLang('en');
});

describe('admin page', () => {
  it('lists users with email, role, status and last sign-in, sending the admin session', async () => {
    signInAs('admin');
    const { calls } = adminApi();
    render(<AdminScreen />);
    await screen.findByTestId('user-ops@example.org');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/admin/users' });
    expect(calls[0]!.headers.authorization).toBe('Bearer tok-admin');
    expect((row('ops@example.org').getByLabelText(t.admin.roleFor('ops@example.org')) as HTMLSelectElement).value).toBe('operator');
    expect(row('ops@example.org').getByText(t.admin.active)).toBeTruthy();
    expect(row('ops@example.org').getByText(t.admin.never)).toBeTruthy();
    expect(row('gone@example.org').getByText(t.admin.disabled)).toBeTruthy();
    expect(row('admin@example.org').queryByText(t.admin.never)).toBeNull();
  });

  it('adds an account by email and role', async () => {
    signInAs('admin');
    const { calls } = adminApi();
    render(<AdminScreen />);
    await screen.findByTestId('user-ops@example.org');
    fireEvent.change(screen.getByLabelText(t.admin.addEmail), { target: { value: ' New@Example.org ' } });
    fireEvent.change(screen.getByLabelText(t.admin.addRole), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: t.admin.add }));
    await screen.findByTestId('user-new@example.org');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post).toMatchObject({ path: '/admin/users', body: { email: 'new@example.org', role: 'admin' } });
    expect(screen.getByText(t.admin.added('new@example.org'))).toBeTruthy();
    expect((screen.getByLabelText(t.admin.addEmail) as HTMLInputElement).value).toBe('');
  });

  it('shows the API message when the email already exists (409)', async () => {
    signInAs('admin');
    adminApi((c) => (c.method === 'POST' && c.path === '/admin/users' ? apiError(409, 'CONFLICT', 'That email already has an account') : undefined));
    render(<AdminScreen />);
    await screen.findByTestId('user-ops@example.org');
    fireEvent.change(screen.getByLabelText(t.admin.addEmail), { target: { value: 'ops@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: t.admin.add }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.admin.actionFailed('That email already has an account'));
    expect(screen.getAllByTestId(/^user-ops@/)).toHaveLength(1);
  });

  it('changes a role with the select', async () => {
    signInAs('admin');
    const { calls } = adminApi();
    render(<AdminScreen />);
    await screen.findByTestId('user-rider@example.org');
    fireEvent.change(row('rider@example.org').getByLabelText(t.admin.roleFor('rider@example.org')), { target: { value: 'operator' } });
    await waitFor(() => expect((row('rider@example.org').getByLabelText(t.admin.roleFor('rider@example.org')) as HTMLSelectElement).value).toBe('operator'));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/admin/users/id-rider%40example.org', body: { role: 'operator' } });
  });

  it('keeps the old role and shows the message when the server refuses (409)', async () => {
    signInAs('admin');
    adminApi((c) => (c.method === 'POST' && c.path.startsWith('/admin/users/') ? apiError(409, 'CONFLICT', 'There must be at least one active admin') : undefined));
    render(<AdminScreen />);
    await screen.findByTestId('user-ops@example.org');
    fireEvent.change(row('ops@example.org').getByLabelText(t.admin.roleFor('ops@example.org')), { target: { value: 'citizen' } });
    expect((await screen.findByRole('alert')).textContent).toBe(t.admin.actionFailed('There must be at least one active admin'));
    expect((row('ops@example.org').getByLabelText(t.admin.roleFor('ops@example.org')) as HTMLSelectElement).value).toBe('operator');
  });

  it('asks before disabling, and only disables after confirming', async () => {
    signInAs('admin');
    const { calls } = adminApi();
    render(<AdminScreen />);
    await screen.findByTestId('user-ops@example.org');
    fireEvent.click(row('ops@example.org').getByRole('button', { name: `${t.admin.disable}: ops@example.org` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t.admin.confirmTitle('ops@example.org'))).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // Cancel changes nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: t.admin.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // Confirm disables.
    fireEvent.click(row('ops@example.org').getByRole('button', { name: `${t.admin.disable}: ops@example.org` }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: t.admin.confirm }));
    await waitFor(() => expect(row('ops@example.org').getByText(t.admin.disabled)).toBeTruthy());
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ body: { disabled: true } });
    // Enabling needs no confirmation.
    fireEvent.click(row('ops@example.org').getByRole('button', { name: `${t.admin.enable}: ops@example.org` }));
    await waitFor(() => expect(row('ops@example.org').getByText(t.admin.active)).toBeTruthy());
  });

  it('does not offer an admin the chance to change their own account', async () => {
    signInAs('admin', { user: { id: 'u-admin', email: 'admin@example.org', role: 'admin', displayName: null } });
    adminApi();
    render(<AdminScreen />);
    await screen.findByTestId('user-admin@example.org');
    expect((row('admin@example.org').getByLabelText(t.admin.roleFor('admin@example.org')) as HTMLSelectElement).disabled).toBe(true);
    expect((row('admin@example.org').getByRole('button', { name: `${t.admin.disable}: admin@example.org` }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders user text as plain text', async () => {
    signInAs('admin');
    const evil = makeAdminUser('citizen', '<b>x</b>@example.org', { id: 'evil' });
    stubFetch((c) => (c.path === '/admin/users' ? { body: { users: [admin, evil] } } : undefined));
    const { container } = render(<AdminScreen />);
    await screen.findByText(/<b>x<\/b>@example.org/);
    expect(container.querySelector('th b')).toBeNull();
  });

  it('shows a retry when the list cannot be loaded', async () => {
    signInAs('admin');
    let fail = true;
    stubFetch((c) => (c.path === '/admin/users' ? (fail ? apiError(500, 'INTERNAL', 'database down') : { body: { users: [admin] } }) : undefined));
    render(<AdminScreen />);
    expect((await screen.findByRole('alert')).textContent).toBe(t.admin.loadFailed('database down'));
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: t.admin.retry }));
    await screen.findByTestId('user-admin@example.org');
  });

  it('is hidden from an operator and a citizen, and never calls the API for them', async () => {
    for (const role of ['operator', 'citizen'] as const) {
      signInAs(role);
      const { fn } = adminApi();
      const view = render(<AdminScreen />);
      expect(await screen.findByTestId('admin-forbidden')).toBeTruthy();
      expect(screen.getByRole('heading', { name: t.admin.forbiddenTitle })).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByLabelText(t.admin.addEmail)).toBeNull();
      expect(fn).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('asks a signed-out visitor to sign in', async () => {
    const { fn } = adminApi();
    render(<AdminScreen />);
    expect(await screen.findByText(t.admin.signInRequired)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: t.account.signIn });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const l of links) expect(l.getAttribute('href')).toBe('/login');
    expect(fn).not.toHaveBeenCalled();
  });

  it('shows the Admin link in the page bar only for an admin', async () => {
    signInAs('operator');
    const a = render(<AdminScreen />);
    await screen.findByTestId('admin-forbidden');
    expect(screen.queryByRole('link', { name: t.nav.admin })).toBeNull();
    a.unmount();
    signInAs('admin');
    adminApi();
    render(<AdminScreen />);
    expect(await screen.findByRole('link', { name: t.nav.admin })).toBeTruthy();
  });
});
