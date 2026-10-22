import type { Metadata } from 'next';
import { t } from '@/i18n';
import { AdminScreen } from '@/components/admin/AdminScreen';

export const metadata: Metadata = { title: `${t.app.name} · ${t.admin.title}` };

/** /admin: accounts. Shown only to an admin session; the server enforces it as well. */
export default function AdminPage() {
  return <AdminScreen />;
}
