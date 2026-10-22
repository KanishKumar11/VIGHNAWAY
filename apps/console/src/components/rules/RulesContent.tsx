'use client';

import { RULE_KEYS, ruleDescription, SCORING_RULES, scoringRulesTable } from '@vighnaway/engine';
import type { RuleKey } from '@vighnaway/engine';
import {
  BookOpen,
  Gauge,
  Info,
  Languages,
  Route,
  ShieldAlert,
  Signpost,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { currentLang, t } from '@/i18n';
import { cn } from '@/lib/cn';
import { ATTRIBUTION } from '@/lib/scenario';
import { Reveal } from '@/components/motion/Reveal';
import { PageShell } from '@/components/shared/PageShell';

type GroupKey = 'traffic' | 'incidents' | 'decision' | 'roads';

/** Which rules sit together on the page. Rules not listed here join the last group, so a new rule always shows. */
const GROUPS: { key: GroupKey; rules: string[] }[] = [
  { key: 'traffic', rules: ['congestionMultiplier', 'unverifiedCongestionWeight', 'dataGap'] },
  {
    key: 'incidents',
    rules: [
      'severityPenaltyS',
      'defaultSeverity',
      'verificationWeight',
      'ageFactor',
      'staleAfterS',
      'unverifiedBlockPenaltyS',
      'ankleFloodSeverity',
      'defaultFloodDepth',
    ],
  },
  { key: 'decision', rules: ['switching', 'tieBreak', 'confidence', 'candidates', 'reversal'] },
  { key: 'roads', rules: ['speedsKmh', 'defaultSpeedKmh', 'access'] },
];

/** One hue per group, from the brand and status tokens. Full class names so Tailwind sees them. */
const TONES: Record<
  GroupKey,
  { icon: LucideIcon; tone: string; box: string; dot: string; chip: string }
> = {
  traffic: {
    icon: Gauge,
    tone: 'var(--vw-brand-from)',
    box: 'bg-brand-from/12 text-brand-from',
    dot: 'bg-brand-from',
    chip: 'border-brand-from/25 bg-brand-from/6',
  },
  incidents: {
    icon: ShieldAlert,
    tone: 'var(--vw-warn)',
    box: 'bg-warn/12 text-warn',
    dot: 'bg-warn',
    chip: 'border-warn/25 bg-warn/6',
  },
  decision: {
    icon: Route,
    tone: 'var(--vw-accent)',
    box: 'bg-accent/12 text-accent',
    dot: 'bg-accent',
    chip: 'border-accent/25 bg-accent/6',
  },
  roads: {
    icon: Signpost,
    tone: 'var(--vw-brand-via)',
    box: 'bg-brand-via/12 text-brand-via',
    dot: 'bg-brand-via',
    chip: 'border-brand-via/25 bg-brand-via/6',
  },
};

/** Sets the card hue for `.vw-tone-card` from a --vw-* colour. */
const toneStyle = (tone: string) => ({ '--tone': tone }) as CSSProperties;

/** The section nearest the top of the viewport, for the "On this page" marker. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(',');
  useEffect(() => {
    const els = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (typeof IntersectionObserver === 'undefined' || els.length === 0) return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = els.find((el) => visible.has(el.id));
        if (first) setActive(first.id);
      },
      // A band just under the sticky bar: the first section crossing it is the current one.
      { rootMargin: '-96px 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active;
}

const isPrimitive = (v: unknown): v is string | number | boolean =>
  ['string', 'number', 'boolean'].includes(typeof v);
/** Values with nested groups (speeds per profile, access lists) need the full width. */
const isWide = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).some((x) => !isPrimitive(x));

/** Renders SCORING_RULES from the engine, so this page never drifts from the code. */
export function RulesContent() {
  const rows = scoringRulesTable();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const placed = new Set(GROUPS.flatMap((g) => g.rules));
  const groups = GROUPS.map((g, i) => ({
    ...g,
    rows: [
      ...g.rules.map((k) => byKey.get(k)),
      ...(i === GROUPS.length - 1 ? rows.filter((r) => !placed.has(r.key)) : []),
    ].filter((r) => r !== undefined),
  })).filter((g) => g.rows.length > 0);
  const sections: { id: string; label: string; dot: string; count?: number }[] = [
    ...groups.map((g) => ({
      id: `rules-${g.key}`,
      label: t.rules.groups[g.key],
      dot: TONES[g.key].dot,
      count: g.rows.length,
    })),
    { id: 'rules-limitations', label: t.rules.limitationsTitle, dot: 'bg-danger' },
    { id: 'rules-attribution', label: t.rules.attributionTitle, dot: 'bg-ink-on-shell-muted' },
  ];
  const active = useActiveSection(sections.map((s) => s.id));

  return (
    <PageShell
      title={t.rules.title}
      eyebrow={t.rules.eyebrow}
      active="/rules"
      intro={<p>{t.rules.intro}</p>}
      aside={
        <span className="tech inline-flex items-center gap-2 rounded-chip border border-shell-hairline bg-shell-raised px-3 py-1.5 text-ink-on-shell shadow-sm">
          <span aria-hidden className="size-2 rounded-chip bg-accent" />
          {t.rules.version(SCORING_RULES.version)}
        </span>
      }
    >
      <Formula text={ruleDescription('formula', currentLang())} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[calc(var(--spacing)*56)_minmax(0,1fr)]">
        <nav aria-label={t.rules.onThisPage} className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-1">
            <p className="eyebrow mb-2 px-3 text-ink-on-shell-muted">{t.rules.onThisPage}</p>
            {sections.map((s) => {
              const on = active === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  aria-current={on ? 'location' : undefined}
                  className={cn(
                    'relative flex items-center justify-between gap-2 rounded-button px-3 py-2 text-body transition-colors',
                    on
                      ? 'font-semibold text-ink-on-shell'
                      : 'text-ink-on-shell-muted hover:text-ink-on-shell',
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="rules-toc-marker"
                      aria-hidden
                      className="absolute inset-0 rounded-button border border-shell-hairline bg-shell-raised shadow-sm"
                    />
                  )}
                  <span className="relative flex items-center gap-2.5">
                    <motion.span
                      aria-hidden
                      animate={{ scale: on ? 1.5 : 1 }}
                      className={cn('size-2 rounded-chip', s.dot)}
                    />
                    {s.label}
                  </span>
                  {s.count !== undefined && (
                    <span className="tech relative text-ink-on-shell-muted">{s.count}</span>
                  )}
                </a>
              );
            })}
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-12">
          {groups.map((g) => {
            const tone = TONES[g.key];
            const Icon = tone.icon;
            const narrow = g.rows.filter((r) => !isWide(ruleValue(r.key))).length;
            let narrowSeen = 0;
            return (
              <section
                key={g.key}
                id={`rules-${g.key}`}
                aria-labelledby={`rules-${g.key}-title`}
                className="scroll-mt-24"
              >
                <Reveal className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn('grid size-10 place-items-center rounded-card', tone.box)}
                  >
                    <Icon className="size-5" />
                  </span>
                  <h2 id={`rules-${g.key}-title`} className="text-console-title font-semibold">
                    {t.rules.groups[g.key]}
                  </h2>
                  <span className="tech ml-1 rounded-chip bg-panel-sunken px-2 py-0.5 text-ink-on-shell-muted">
                    {g.rows.length}
                  </span>
                </Reveal>
                <dl className="mt-5 grid grid-flow-dense gap-4 md:grid-cols-2">
                  {g.rows.map((r, i) => {
                    const value = ruleValue(r.key);
                    const wide = isWide(value);
                    // An odd card out at the end of a group takes the full row instead of leaving a hole.
                    const lastOdd = !wide && ++narrowSeen === narrow && narrow % 2 === 1;
                    return (
                      <Reveal
                        key={r.key}
                        delay={(i % 2) * 0.08}
                        className={cn((wide || lastOdd) && 'md:col-span-2')}
                      >
                        <div
                          className="vw-tone-card flex h-full flex-col gap-3 p-6"
                          style={toneStyle(tone.tone)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <dt className="text-title font-semibold text-ink-on-shell">
                              {t.rules.titles[r.key] ?? r.key}
                            </dt>
                            <span
                              aria-hidden
                              className="vw-tone-badge tech shrink-0 rounded-chip px-2 py-0.5 font-semibold"
                            >
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <dd className="text-body text-ink-on-shell-muted">
                            {(RULE_KEYS as string[]).includes(r.key)
                              ? ruleDescription(r.key as RuleKey, currentLang())
                              : r.description}
                          </dd>
                          <dd className="mt-auto pt-1">
                            <span className="sr-only">
                              {t.rules.value}: {r.value}
                            </span>
                            <div aria-hidden>
                              <RuleValue value={value} chip={tone.chip} />
                            </div>
                          </dd>
                        </div>
                      </Reveal>
                    );
                  })}
                </dl>
              </section>
            );
          })}

          <section className="grid gap-4 xl:grid-cols-[2fr_1fr] xl:items-start">
            <Reveal>
              <div
                id="rules-limitations"
                className="vw-tone-card scroll-mt-24 p-6"
                style={toneStyle('var(--vw-danger)')}
              >
                <h2 className="flex items-center gap-3 text-console-title font-semibold">
                  <span
                    aria-hidden
                    className="grid size-10 place-items-center rounded-card bg-danger/12 text-danger"
                  >
                    <TriangleAlert className="size-5" />
                  </span>
                  {t.rules.limitationsTitle}
                </h2>
                <ul className="mt-5 grid gap-x-8 gap-y-3 md:grid-cols-2">
                  {t.rules.limitations.map((l) => (
                    <li key={l} className="flex items-start gap-3 text-body text-ink-on-shell">
                      <Info aria-hidden className="mt-1 size-4 shrink-0 text-warn" />
                      {l}
                    </li>
                  ))}
                  <li className="flex items-start gap-3 text-body text-ink-on-shell">
                    <Languages aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
                    {t.view.translationNote}
                  </li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <div
                id="rules-attribution"
                className="vw-tone-card scroll-mt-24 p-6"
                style={toneStyle('var(--vw-ink-on-shell-muted)')}
              >
                <h2 className="flex items-center gap-3 text-console-title font-semibold">
                  <span
                    aria-hidden
                    className="grid size-10 place-items-center rounded-card bg-panel-sunken text-ink-on-shell-muted"
                  >
                    <BookOpen className="size-5" />
                  </span>
                  {t.rules.attributionTitle}
                </h2>
                <p className="mt-5 text-body text-ink-on-shell-muted">{ATTRIBUTION}</p>
                <p className="mt-2 text-body text-ink-on-shell-muted">{t.map.googleAttribution}</p>
              </div>
            </Reveal>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function ruleValue(key: string): unknown {
  const entry = (SCORING_RULES as Record<string, unknown>)[key];
  return entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
}

/** The formula on the indigo hero card, one term per line so it reads as a sum. */
function Formula({ text }: { text: string }) {
  const eq = text.indexOf(' = ');
  const lhs = eq > 0 ? text.slice(0, eq) : null;
  const terms = (eq > 0 ? text.slice(eq + 3) : text).split(' + ');
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="vw-hero mt-10 p-6 sm:p-8"
    >
      <h2 className="eyebrow text-chrome-accent">{t.rules.formula}</h2>
      <div className="mt-4 flex flex-col gap-3 font-mono text-body xl:flex-row xl:items-stretch">
        {lhs && (
          <p className="flex shrink-0 items-center text-console-title font-semibold">{lhs} =</p>
        )}
        {terms.map((term, i) => (
          <motion.div
            key={term}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 xl:flex-1"
          >
            {i > 0 && (
              <span className="text-console-title font-semibold text-chrome-accent">+</span>
            )}
            <p className="h-full flex-1 rounded-card border border-chrome-line bg-chrome-fill px-4 py-3 leading-relaxed">
              {term}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/** Rule values as chips: plain values, lists, key and value pairs, and labelled groups for nested tables. */
function RuleValue({ value, chip }: { value: unknown; chip: string }) {
  if (isPrimitive(value)) return <Chip chip={chip} value={String(value)} />;
  if (Array.isArray(value))
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <Chip key={i} chip={chip} value={String(v)} />
        ))}
      </div>
    );
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const flat = entries.filter(([, v]) => isPrimitive(v));
    const nested = entries.filter(([, v]) => !isPrimitive(v));
    return (
      <div className="flex flex-col gap-3">
        {flat.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flat.map(([k, v]) => (
              <Chip key={k} chip={chip} label={k} value={String(v)} />
            ))}
          </div>
        )}
        {nested.map(([k, v]) => (
          <div
            key={k}
            className="grid gap-1.5 sm:grid-cols-[calc(var(--spacing)*44)_minmax(0,1fr)] sm:items-start"
          >
            <span className="tech pt-1.5 font-semibold text-ink-on-shell">{k}</span>
            <RuleValue value={v} chip={chip} />
          </div>
        ))}
      </div>
    );
  }
  return <Chip chip={chip} value={String(value)} />;
}

function Chip({ chip, label, value }: { chip: string; label?: string; value: string }) {
  return (
    <span
      className={cn('tech inline-flex items-center gap-1.5 rounded-button border px-2 py-1', chip)}
    >
      {label && <span className="text-ink-on-shell-muted">{label}</span>}
      <span className="font-semibold text-ink-on-shell">{value}</span>
    </span>
  );
}
