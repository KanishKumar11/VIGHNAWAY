import type { Metadata, Viewport } from 'next';
import { themes } from '@vighnaway/tokens';
import { t } from '@/i18n';
import { ATTRIBUTION, isLiveScenario, scenarioFor } from '@/lib/scenario';
import { ReportForm } from '@/components/report/ReportForm';
import { ReportFooter, ReportHeader } from '@/components/report/ReportHeader';

export const metadata: Metadata = { title: `${t.app.name} · ${t.report.title}` };
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: themes.light.shell },
    { media: '(prefers-color-scheme: dark)', color: themes.dark.shell },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Public mobile web form opened by the QR code on the console (UX_FLOWS section 10). It posts to
 * the scenario named in ?scenario= (the one the console shows), else the simulated demo.
 */
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (await searchParams).scenario;
  const scenario = scenarioFor(typeof q === 'string' ? q : null);
  const live = isLiveScenario(scenario);
  return (
    <div className="min-h-dvh bg-shell text-ink">
      <ReportHeader live={live} />
      <main className="relative mx-auto flex min-h-[calc(100dvh-var(--spacing)*36)] max-w-[calc(var(--spacing)*130)] flex-col border-t border-shell-line bg-panel">
        <ReportForm scenarioId={scenario.id} />
        <ReportFooter attribution={ATTRIBUTION} />
      </main>
    </div>
  );
}
