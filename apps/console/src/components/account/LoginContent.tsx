'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSessionRole } from '@/components/account/AccountMenu';
import { Frame, SignedOutView } from '@/components/account/ConsoleGate';
import { ScreenLoading } from '@/components/shared/ScreenLoading';

/**
 * /login: the same sign-in page as the control room's gate (brand panel on the left, card on the right) when
 * signed out, so signing out lands on one familiar screen; once signed in, where to go next.
 */
export function LoginContent() {
  const role = useSessionRole();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  // The demo-access dialog on the signed-out page reads the stored operator token.
  useEffect(() => {
    useOperator.getState().hydrate();
  }, []);
  if (!hydrated) return <ScreenLoading full />;
  if (!user || !role) return <SignedOutView />;
  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <h1 className="text-console-title font-semibold">{t.account.signedInTitle}</h1>
        <p className="text-base text-ink-muted">{t.account.signedInAs(user.email)}</p>
        <div className="flex flex-wrap items-center gap-3">
          {role !== 'citizen' && (
            <Link href="/console" className={cn(buttonVariants({ variant: 'primary' }))}>
              {t.account.openConsole}
            </Link>
          )}
          {role === 'admin' && (
            <Link href="/admin" className={cn(buttonVariants({ variant: 'outline' }))}>
              {t.account.openAdmin}
            </Link>
          )}
          <Link href="/report" className={cn(buttonVariants({ variant: role === 'citizen' ? 'primary' : 'outline' }))}>
            {t.account.openReport}
          </Link>
          <Button variant="outline" onClick={() => void useSession.getState().signOut()}>
            {t.account.signOut}
          </Button>
        </div>
      </div>
    </Frame>
  );
}
