'use client';

import { EmailSchema, ROLES, type AdminUser, type Role } from '@vighnaway/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { currentLang, LANG_TAG, t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';
import { PageShell } from '@/components/shared/PageShell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const FIELD = 'min-h-12 rounded-button border border-panel-line bg-panel-sunken px-4 text-base text-ink';
const CARD = 'rounded-sheet border border-panel-line bg-panel p-6 text-ink shadow-md';

const formatWhen = (iso: string | null): string => {
  if (!iso) return t.admin.never;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LANG_TAG[currentLang()], { dateStyle: 'medium', timeStyle: 'short' });
};

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** /admin. Visible only to an admin session; every call is checked by the server again. */
export function AdminScreen() {
  const hydrated = useSession((s) => s.hydrated);
  const user = useSession((s) => s.user);
  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  let body;
  if (!hydrated) {
    body = (
      <p role="status" className="mt-8 text-base text-ink-on-shell-muted">
        {t.admin.loading}
      </p>
    );
  } else if (!user) {
    body = (
      <div className={cn(CARD, 'mt-8 flex max-w-[calc(var(--spacing)*140)] flex-col gap-4')}>
        <p className="text-base">{t.admin.signInRequired}</p>
        <Link href="/login" className={cn(buttonVariants({ variant: 'primary' }), 'self-start')}>
          {t.account.signIn}
        </Link>
      </div>
    );
  } else if (user.role !== 'admin') {
    body = (
      <div className={cn(CARD, 'mt-8 flex max-w-[calc(var(--spacing)*140)] flex-col gap-3')} data-testid="admin-forbidden">
        <h2 className="text-title font-semibold">{t.admin.forbiddenTitle}</h2>
        <p className="text-base text-ink-muted">{t.admin.forbiddenBody}</p>
      </div>
    );
  } else {
    body = <UserManager selfId={user.id} />;
  }

  return (
    <PageShell title={t.admin.title} eyebrow={t.admin.eyebrow} intro={t.admin.intro}>
      {body}
    </PageShell>
  );
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function UserManager({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [adding, setAdding] = useState(false);
  const ids = useId();

  /** Calls the API with the admin's session; a rejected session is dropped. */
  const call = useCallback(async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
    const token = useSession.getState().token;
    if (!token) throw new ApiError('UNAUTHORIZED', t.operator.rejected, 401);
    try {
      return await run(token);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') useSession.getState().clear();
      if (e instanceof ApiError && e.code === 'FORBIDDEN') void useSession.getState().revalidate();
      throw e;
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await call((token) => api.adminUsers(token));
      setUsers(r.users);
    } catch (e) {
      setLoadError(t.admin.loadFailed(messageOf(e)));
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (u: AdminUser) => setUsers((cur) => (cur ? cur.map((x) => (x.id === u.id ? u : x)) : cur));

  async function update(target: AdminUser, body: { role?: Role; disabled?: boolean }) {
    setBusyId(target.id);
    setNotice(null);
    try {
      const r = await call((token) => api.adminUpdateUser(token, target.id, body));
      replace(r.user);
      setNotice({ kind: 'ok', text: t.admin.updated(r.user.email) });
    } catch (e) {
      setNotice({ kind: 'error', text: t.admin.actionFailed(messageOf(e)) });
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (adding) return;
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setNotice({ kind: 'error', text: t.account.invalidEmail });
      return;
    }
    setAdding(true);
    setNotice(null);
    try {
      const r = await call((token) => api.adminCreateUser(token, { email: parsed.data, role }));
      setUsers((cur) => [...(cur ?? []), r.user]);
      setEmail('');
      setNotice({ kind: 'ok', text: t.admin.added(r.user.email) });
    } catch (err) {
      setNotice({ kind: 'error', text: t.admin.actionFailed(messageOf(err)) });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      <div aria-live="polite" role={notice?.kind === 'error' ? 'alert' : 'status'} className="empty:hidden">
        {notice && (
          <p className={cn('rounded-card border px-4 py-3 text-base font-semibold', notice.kind === 'error' ? 'border-danger bg-danger-surface text-danger-ink' : 'border-control-border bg-panel-sunken text-ink')}>
            {notice.text}
          </p>
        )}
      </div>

      <section className={CARD} aria-labelledby={`${ids}-list`}>
        <h2 id={`${ids}-list`} className="sr-only">
          {t.admin.title}
        </h2>
        {loadError ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-base font-semibold text-danger-ink">
              {loadError}
            </p>
            <Button variant="outline" onClick={() => void load()}>
              {t.admin.retry}
            </Button>
          </div>
        ) : users === null ? (
          <p role="status" className="text-base text-ink-muted">
            {t.admin.loading}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[calc(var(--spacing)*200)] border-collapse text-left text-base">
              <caption className="sr-only">{t.admin.title}</caption>
              <thead>
                <tr className="border-b border-panel-line text-meta text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.admin.columns.email}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.admin.columns.role}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.admin.columns.status}</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">{t.admin.columns.lastSignIn}</th>
                  <th scope="col" className="py-2 font-semibold">{t.admin.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === selfId;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} data-testid={`user-${u.email}`} className="border-b border-panel-line align-middle last:border-b-0">
                      <th scope="row" className="py-3 pr-4 font-medium break-all">
                        {/* User text is rendered as plain text. */}
                        {u.email}
                        {self && <span className="ml-2 text-meta font-semibold text-ink-muted">({t.admin.you})</span>}
                      </th>
                      <td className="py-3 pr-4">
                        <select
                          aria-label={t.admin.roleFor(u.email)}
                          value={u.role}
                          disabled={self || busy}
                          title={self ? t.admin.selfHint : undefined}
                          onChange={(e) => void update(u, { role: e.target.value as Role })}
                          className={cn(FIELD, 'min-h-10 py-1')}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t.account.roles[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={cn('inline-flex h-6 items-center rounded-chip border px-2 text-meta font-semibold', u.disabled ? 'border-warn bg-warn-surface text-warn-ink' : 'border-control-border bg-panel-sunken text-ink')}>
                          {u.disabled ? t.admin.disabled : t.admin.active}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular text-ink-muted">{formatWhen(u.lastLoginAt)}</td>
                      <td className="py-3">
                        {u.disabled ? (
                          <Button size="sm" variant="outline" disabled={self || busy} onClick={() => void update(u, { disabled: false })} aria-label={`${t.admin.enable}: ${u.email}`}>
                            {t.admin.enable}
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" disabled={self || busy} title={self ? t.admin.selfHint : undefined} onClick={() => setConfirming(u)} aria-label={`${t.admin.disable}: ${u.email}`}>
                            {t.admin.disable}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={CARD} aria-labelledby={`${ids}-add`}>
        <h2 id={`${ids}-add`} className="text-title font-semibold">
          {t.admin.addTitle}
        </h2>
        <p className="mt-1 text-base text-ink-muted">{t.admin.addIntro}</p>
        <form onSubmit={add} noValidate className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex min-w-[calc(var(--spacing)*70)] flex-1 flex-col gap-2">
            <label htmlFor={`${ids}-email`} className="text-base font-semibold">
              {t.admin.addEmail}
            </label>
            <input id={`${ids}-email`} type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${ids}-role`} className="text-base font-semibold">
              {t.admin.addRole}
            </label>
            <select id={`${ids}-role`} value={role} onChange={(e) => setRole(e.target.value as Role)} className={FIELD}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.account.roles[r]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={adding}>
            {adding ? t.admin.adding : t.admin.add}
          </Button>
        </form>
      </section>

      <Dialog open={confirming !== null} onOpenChange={(o) => (o ? undefined : setConfirming(null))}>
        <DialogContent>
          {confirming && (
            <>
              <DialogTitle>{t.admin.confirmTitle(confirming.email)}</DialogTitle>
              <DialogDescription>{t.admin.confirmBody}</DialogDescription>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setConfirming(null)}>
                  {t.admin.cancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const target = confirming;
                    setConfirming(null);
                    void update(target, { disabled: true });
                  }}
                >
                  {t.admin.confirm}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
