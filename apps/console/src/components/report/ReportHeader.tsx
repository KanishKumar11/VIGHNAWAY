'use client';

import { t } from '@/i18n';
import { LiveDataBadge } from '@/components/console/Header';
import { SimulatedBadge } from '@/components/shared/EvidenceChips';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { ViewMenu } from '@/components/shared/ViewMenu';

/** /report header, as on the phone: the Simulated or Live data badge, language and theme, then the title and a short note. */
export function ReportHeader({ live }: { live: boolean }) {
  return (
    <header className="mx-auto max-w-[calc(var(--spacing)*130)] px-4 pt-[max(var(--vw-space-sm),env(safe-area-inset-top))] pb-6">
      <div className="flex min-h-12 items-center justify-between gap-3">
        {live ? <LiveDataBadge /> : <SimulatedBadge />}
        <span className="flex items-center gap-2">
          <ViewMenu console={false} compact />
          <ThemeToggle />
        </span>
      </div>
      <h1 className="mt-3 text-[1.625rem] leading-8 font-bold tracking-tight text-ink">{t.report.title}</h1>
      <p className="mt-1 text-base text-ink-muted">{live ? t.report.headerLive : t.report.header}</p>
    </header>
  );
}

/** Attribution line under the form. */
export function ReportFooter({ attribution }: { attribution: string }) {
  return (
    <p className="mt-auto px-5 pt-4 pb-8 text-meta text-ink-muted">
      {attribution} · {t.map.googleAttribution}
    </p>
  );
}
