import type { Metadata } from 'next';
import { t } from '@/i18n';
import { PageShell } from '@/components/shared/PageShell';
import { DebugPanel } from './DebugPanel';

export const metadata: Metadata = { title: `${t.app.name} · ${t.debug.title}` };

export default function DebugPage() {
  return (
    <PageShell title={t.debug.title} eyebrow={t.debug.eyebrow} active="/debug" intro={<p>{t.debug.intro}</p>}>
      <DebugPanel />
    </PageShell>
  );
}
