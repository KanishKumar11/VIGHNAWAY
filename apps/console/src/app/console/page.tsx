import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ConsoleGate } from '@/components/account/ConsoleGate';
import { ConsoleScreenLazy } from './ConsoleScreenLazy';

export const metadata: Metadata = { title: `${t.app.name} ${t.app.controlRoom}` };

export default function ConsolePage() {
  // The gate shows the control room only to an operator or admin session (or the demo token).
  return (
    <ConsoleGate>
      <ConsoleScreenLazy />
    </ConsoleGate>
  );
}
