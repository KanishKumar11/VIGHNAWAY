import type { Metadata } from 'next';
import { t } from '@/i18n';
import { VerifyContent } from '@/components/verify/VerifyContent';

export const metadata: Metadata = { title: `${t.app.name} · ${t.verify.title}` };

/** /verify: re-runs a decision receipt in this browser; rendered on the client so the language switch applies. */
export default function VerifyPage() {
  return <VerifyContent />;
}
