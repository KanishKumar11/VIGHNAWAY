'use client';

import type { Role } from '@vighnaway/contracts';
import { LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';

/** The signed-in role, or null. Triggers hydration so any page that shows it works on its own. */
export function useSessionRole(): Role | null {
  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);
  return useSession((s) => s.user?.role ?? null);
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      data-testid="role-badge"
      className={cn('inline-flex h-6 items-center rounded-chip border border-control-border bg-panel-sunken px-2 text-meta font-semibold whitespace-nowrap text-ink-on-shell', className)}
    >
      {t.account.roles[role]}
    </span>
  );
}

/**
 * Header identity: email, role badge and Sign out, or a Sign in link. `compact` is for the
 * crowded control-room bar (the email moves into the button's name until the bar is wide).
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const hydrated = useSession((s) => s.hydrated);
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);
  if (!hydrated) return null;
  if (!user) {
    return (
      <Link href="/login" aria-label={t.account.signIn} title={t.account.signIn} className={cn('vw-press ctl h-10 shrink-0 px-4 text-body whitespace-nowrap', compact && 'max-[1899px]:w-10 max-[1899px]:px-0')}>
        <LogIn aria-hidden className="size-4" />
        <span className={cn(compact && 'max-[1899px]:hidden')}>{t.account.signIn}</span>
      </Link>
    );
  }
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2" aria-label={t.account.menuLabel} role="group">
      <span className={cn('min-w-0 truncate text-meta text-ink-on-shell-muted', compact && 'max-[1899px]:sr-only')} title={user.email}>
        {user.email}
      </span>
      <RoleBadge role={user.role} />
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label={compact ? `${t.account.signOut} (${user.email})` : undefined}
        title={t.account.signOut}
        className={cn('vw-press ctl h-10 shrink-0 text-body whitespace-nowrap', compact ? 'px-3' : 'px-4')}
      >
        <LogOut aria-hidden className="size-4" />
        <span className={cn(compact && 'max-[1899px]:sr-only')}>{t.account.signOut}</span>
      </button>
    </div>
  );
}
