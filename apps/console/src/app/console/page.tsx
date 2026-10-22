import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ConsoleScreen } from './ConsoleScreen';

export const metadata: Metadata = { title: `${t.app.name} ${t.app.controlRoom}` };

export default function ConsolePage() {
  return <ConsoleScreen />;
}
