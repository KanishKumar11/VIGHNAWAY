import type { Metadata } from 'next';
import { t } from '@/i18n';
import { LoginContent } from '@/components/account/LoginContent';

export const metadata: Metadata = { title: `${t.app.name} · ${t.account.title}` };

/** /login: email, then a 6-digit code. Citizens, operators and admins all sign in here. */
export default function LoginPage() {
  return <LoginContent />;
}
