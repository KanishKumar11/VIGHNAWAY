'use client';

import type { MyStatsResponse } from '@vighnaway/contracts';
import { LogIn } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/stores/session';
import { SignInForm } from '@/components/account/SignInForm';
import { Button } from '@/components/ui/button';

/** The quiet thank-you line: counts only. Never a score, rank or anything routing reads. */
export function StatsLine({ stats }: { stats: MyStatsResponse | null }) {
  if (!stats) return null;
  return (
    <div data-testid="my-stats">
      <p className="text-body text-ink">{stats.reports > 0 ? t.reportAccount.stats(stats.reports, stats.inVerifiedIncidents) : t.reportAccount.statsNone}</p>
      <p className="text-meta text-ink-muted">{t.reportAccount.statsNote}</p>
    </div>
  );
}

/**
 * /report: optional sign-in. Reporting never needs it; signing in links reports to the account
 * and shows how many were sent. The form below works the same either way.
 */
export function ReportAccount() {
  const hydrated = useSession((s) => s.hydrated);
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const nonce = useSession((s) => s.statsNonce);
  const signOut = useSession((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<MyStatsResponse | null>(null);
  const panelId = useId();

  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!token) {
      setStats(null);
      return;
    }
    let live = true;
    api
      .myStats(token)
      .then((s) => live && setStats(s))
      .catch((e) => {
        if (!live) return;
        setStats(null);
        if (e instanceof ApiError && e.code === 'UNAUTHORIZED') useSession.getState().clear();
      });
    return () => {
      live = false;
    };
  }, [token, nonce]);

  if (!hydrated) return null;

  if (user) {
    return (
      <section aria-label={t.account.menuLabel} className="mx-4 mb-6 flex flex-col gap-2 rounded-card border border-panel-line bg-panel px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-body font-semibold break-all text-ink">{t.account.signedInAs(user.email)}</p>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            {t.account.signOut}
          </Button>
        </div>
        <StatsLine stats={stats} />
      </section>
    );
  }

  return (
    <section aria-label={t.account.menuLabel} className="mx-4 mb-6 flex flex-col gap-3">
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 rounded-card border border-panel-line bg-panel p-4 shadow-sm">
          <SignInForm />
          <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(false)}>
            {t.reportAccount.hide}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button size="sm" variant="outline" aria-expanded={false} aria-controls={panelId} onClick={() => setOpen(true)}>
            <LogIn aria-hidden className="size-4" />
            {t.reportAccount.prompt}
          </Button>
          <p className="text-meta text-ink-muted">{t.reportAccount.optional}</p>
        </div>
      )}
    </section>
  );
}
