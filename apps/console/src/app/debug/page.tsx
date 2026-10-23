import type { Metadata } from 'next';
import { t } from '@/i18n';
import { PageShell } from '@/components/shared/PageShell';
import { ConsoleGate } from '@/components/account/ConsoleGate';
import { DebugPanelLazy } from './DebugPanelLazy';

export const metadata: Metadata = { title: `${t.app.name} · ${t.debug.title}` };

export default function DebugPage() {
  // Engine parity and graph versions are operator tooling: signed out, the visitor sees only the sign-in.
  return (
    <ConsoleGate>
      <PageShell title={t.debug.title} eyebrow={t.debug.eyebrow} active="/debug" intro={<p>{t.debug.intro}</p>}>
        <DebugPanelLazy />
      </PageShell>
    </ConsoleGate>
  );
}
