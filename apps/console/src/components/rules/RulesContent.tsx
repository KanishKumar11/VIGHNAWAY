'use client';

import { RULE_KEYS, ruleDescription, SCORING_RULES, scoringRulesTable } from '@vighnaway/engine';
import type { RuleKey } from '@vighnaway/engine';
import { Info, Languages } from 'lucide-react';
import { currentLang, t } from '@/i18n';
import { ATTRIBUTION } from '@/lib/scenario';
import { PageShell } from '@/components/shared/PageShell';

/** Renders SCORING_RULES from the engine, so this page never drifts from the code. */
export function RulesContent() {
  const rows = scoringRulesTable();
  return (
    <PageShell
      title={t.rules.title}
      eyebrow={t.rules.eyebrow}
      active="/rules"
      intro={
        <>
          <p>{t.rules.intro}</p>
          <p className="tech mt-3 text-ink-on-shell-muted">{t.rules.version(SCORING_RULES.version)}</p>
        </>
      }
    >
      <section className="mt-10 border-y border-shell-line py-6">
        <h2 className="text-meta font-semibold text-accent-ink">{t.rules.formula}</h2>
        <p className="mt-2 font-mono text-title leading-relaxed font-medium text-ink-on-shell">{ruleDescription('formula', currentLang())}</p>
      </section>

      <dl className="mt-2">
        {rows.map((r) => (
          <div key={r.key} className="grid gap-x-10 gap-y-1.5 border-b border-shell-line py-5 md:grid-cols-[16rem_1fr_minmax(0,18rem)]">
            <dt className="text-title font-semibold text-ink-on-shell">{t.rules.titles[r.key] ?? r.key}</dt>
            <dd className="text-body text-ink-on-shell-muted">{(RULE_KEYS as string[]).includes(r.key) ? ruleDescription(r.key as RuleKey, currentLang()) : r.description}</dd>
            <dd className="md:text-right">
              <span className="sr-only">{t.rules.value}: </span>
              <span className="tech break-words text-ink-on-shell">{r.value}</span>
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-12 grid gap-10 md:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="text-console-title font-semibold">{t.rules.limitationsTitle}</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {t.rules.limitations.map((l) => (
              <li key={l} className="flex items-start gap-3 text-body text-ink-on-shell">
                <Info aria-hidden className="mt-1 size-4 shrink-0 text-ink-on-shell-muted" />
                {l}
              </li>
            ))}
            <li className="flex items-start gap-3 text-body text-ink-on-shell">
              <Languages aria-hidden className="mt-1 size-4 shrink-0 text-ink-on-shell-muted" />
              {t.view.translationNote}
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-console-title font-semibold">{t.rules.attributionTitle}</h2>
          <p className="mt-4 text-body text-ink-on-shell-muted">{ATTRIBUTION}</p>
          <p className="mt-2 text-body text-ink-on-shell-muted">{t.map.googleAttribution}</p>
        </div>
      </section>
    </PageShell>
  );
}
