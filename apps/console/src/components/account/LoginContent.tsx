'use client';

import Link from 'next/link';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';
import { Button } from '@/components/ui/button';
import { useSessionRole } from '@/components/account/AccountMenu';
import { SignInForm } from '@/components/account/SignInForm';
import { PageShell } from '@/components/shared/PageShell';
import { buttonVariants } from '@/components/ui/button';

/** /login body: the sign-in form, or where to go next once signed in. */
export function LoginContent() {
  const role = useSessionRole();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  return (
    <PageShell title={t.account.title}>
      <div className="mt-8 max-w-[calc(var(--spacing)*140)] rounded-sheet border border-panel-line bg-panel p-6 text-ink shadow-md">
        {!hydrated ? (
          <p role="status" className="text-base text-ink-muted">
            {t.gate.loading}
          </p>
        ) : user && role ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-title font-semibold">{t.account.signedInTitle}</h2>
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
        ) : (
          <SignInForm />
        )}
      </div>
    </PageShell>
  );
}

