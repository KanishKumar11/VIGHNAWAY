import type { Metadata } from 'next';
import { t } from '@/i18n';
import { AfterActionContent } from '@/components/afterAction/AfterActionContent';

export const metadata: Metadata = { title: `${t.app.name} · ${t.afterAction.title}` };

/** /after-action: a printable summary of the run, rebuilt on the client so the language switch applies. */
export default function AfterActionPage() {
  return <AfterActionContent />;
}
