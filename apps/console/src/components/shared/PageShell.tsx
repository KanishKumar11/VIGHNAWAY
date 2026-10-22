'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { BrandMark } from './BrandMark';
import { SimulatedBadge } from './EvidenceChips';
import { ThemeToggle } from './ThemeToggle';
import { ViewMenu } from './ViewMenu';

const NAV = () =>
  [
    ['/console', t.nav.console],
    ['/rules', t.nav.rules],
    ['/verify', t.nav.verify],
    ['/debug', t.nav.debug],
    ['/report', t.nav.report],
  ] as const;

/** Floating bar and reading column for /rules and /debug, in the console's visual system. */
export function PageShell({ title, eyebrow, intro, active, children }: { title: string; eyebrow?: string; intro?: ReactNode; active?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-shell text-base text-ink-on-shell">
      <div className="sticky top-0 z-30 border-b border-shell-line bg-shell-raised">
        <header className="mx-auto flex h-16 max-w-[calc(var(--spacing)*300)] items-center gap-4 px-5">
          <Link href="/console" className="flex items-center gap-3">
            <BrandMark className="size-8" />
            <span className="text-body font-semibold tracking-wordmark">{t.app.name}</span>
          </Link>
          <SimulatedBadge onShell />
          <nav className="ml-auto flex gap-1 text-body">
            {NAV().map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={active === href ? 'page' : undefined}
                className={cn(
                  'rounded-button px-3 py-1.5 font-medium transition-colors',
                  active === href ? 'bg-panel-sunken text-ink-on-shell' : 'text-ink-on-shell-muted hover:text-ink-on-shell',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <ViewMenu console={false} />
          <ThemeToggle />
        </header>
      </div>
      <main className="mx-auto max-w-[calc(var(--spacing)*280)] px-6 pt-14 pb-16">
        {eyebrow && (
          <p className="eyebrow text-accent-ink">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-clock font-bold tracking-tight">{title}</h1>
        {intro && <div className="mt-3 max-w-[70ch] text-base text-ink-on-shell-muted">{intro}</div>}
        {children}
      </main>
    </div>
  );
}
