'use client';

import { KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { useOperatorAccess } from '@/lib/credential';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { SignInForm } from '@/components/account/SignInForm';
import { OperatorTokenDialog } from '@/components/console/OperatorTokenDialog';
import { BrandMark } from '@/components/shared/BrandMark';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6 text-ink-on-shell">
      <main className="flex w-full max-w-[calc(var(--spacing)*140)] flex-col gap-6 rounded-sheet border border-panel-line bg-panel p-8 text-ink shadow-md">{children}</main>
    </div>
  );
}

/**
 * Decides what /console shows. The control room itself needs an operator or admin session, or the
 * legacy demo token. A signed-in citizen is told plainly why not. This is for clarity: the server
 * rejects operator actions from anyone without a credential, whatever the page shows.
 */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const access = useOperatorAccess();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);

  useEffect(() => {
    useOperator.getState().hydrate();
    void useSession.getState().hydrate();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <Frame>
        <p role="status" className="text-base text-ink-muted">
          {t.gate.loading}
        </p>
      </Frame>
    );
  }

  if (access) return <>{children}</>;

  if (user) {
    // Signed in, but a citizen: no operator control is rendered at all.
    return (
      <Frame>
        <div className="flex items-center gap-3">
          <ShieldAlert aria-hidden className="size-8 shrink-0 text-warn-ink" />
          <h1 className="text-console-title font-semibold">{t.gate.citizenTitle}</h1>
        </div>
        <p className="text-base text-ink-muted">{t.gate.citizenBody(user.email)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/report" className={cn(buttonVariants({ variant: 'primary' }))}>
            {t.gate.reportLink}
          </Link>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-5" />
            {t.account.signOut}
          </Button>
        </div>
        <OperatorTokenDialog />
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="flex items-center gap-3">
        <BrandMark className="size-10 shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="vw-brand-text text-body font-extrabold tracking-wordmark">{t.app.name}</span>
          <span className="text-meta text-ink-muted">{t.app.controlRoom}</span>
        </div>
      </header>
      <h1 className="text-console-title font-semibold">{t.gate.title}</h1>
      <p className="-mt-3 text-base text-ink-muted">{t.gate.intro}</p>
      <SignInForm />
      <div className="flex flex-col gap-2 border-t border-panel-line pt-5">
        <Button variant="outline" onClick={() => useOperator.getState().openDialog()} className="self-start">
          <KeyRound aria-hidden className="size-5" />
          {t.gate.demoAccess}
        </Button>
        <p className="text-meta text-ink-muted">{t.gate.demoAccessHint}</p>
      </div>
      <OperatorTokenDialog />
    </Frame>
  );
}

