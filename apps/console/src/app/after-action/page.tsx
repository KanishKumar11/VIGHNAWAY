import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ConsoleGate } from '@/components/account/ConsoleGate';
import { AfterActionLazy } from '@/components/afterAction/AfterActionLazy';

export const metadata: Metadata = { title: `${t.app.name} · ${t.afterAction.title}` };

/** /after-action: a printable summary of the run, rebuilt on the client so the language switch applies. */
export default function AfterActionPage() {
  // The run summary is for operators: signed out, the visitor sees only the sign-in.
  return (
    <ConsoleGate>
      <AfterActionLazy />
    </ConsoleGate>
  );
}
