import type { Metadata } from 'next';
import { t } from '@/i18n';
import { RulesContent } from '@/components/rules/RulesContent';

export const metadata: Metadata = { title: `${t.app.name} · ${t.rules.title}` };

/** /rules: the engine's scoring rules, rendered on the client so the language switch applies. */
export default function RulesPage() {
  return <RulesContent />;
}
