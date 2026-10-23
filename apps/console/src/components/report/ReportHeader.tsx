'use client';

import { t } from '@/i18n';
import { LiveDataBadge } from '@/components/console/Header';
import { Wordmark } from '@/components/shared/BrandMark';
import { SimulatedBadge } from '@/components/shared/EvidenceChips';
import { ViewMenu } from '@/components/shared/ViewMenu';

/** /report header: identity, Simulated or Live data, language and larger text, the title. */
export function ReportHeader({ live }: { live: boolean }) {
  return (
    <header className="mx-auto max-w-[calc(var(--spacing)*130)] px-5 pt-[max(var(--vw-space-md),env(safe-area-inset-top))] pb-5 text-ink-on-shell">
      <div className="flex items-center gap-3">
        <Wordmark plate className="h-12" />
        <span className="ml-auto flex items-center gap-2">
          {live ? <LiveDataBadge /> : <SimulatedBadge onShell />}
          <ViewMenu console={false} compact />
        </span>
      </div>
      <h1 className="mt-5 text-console-title font-semibold">{t.report.title}</h1>
      <p className="mt-0.5 text-meta text-ink-on-shell-muted">{live ? t.report.headerLive : t.report.header}</p>
    </header>
  );
}

/** Attribution line under the form. */
export function ReportFooter({ attribution }: { attribution: string }) {
  return (
    <p className="mt-auto px-5 pt-2 pb-8 text-meta text-ink-muted">
      {attribution} · {t.map.googleAttribution}
    </p>
  );
}
