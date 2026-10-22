'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { AccountMenu, useSessionRole } from '@/components/account/AccountMenu';
import { Wordmark } from './BrandMark';
import { SimulatedBadge } from './EvidenceChips';
import { ThemeToggle } from './ThemeToggle';
import { ViewMenu } from './ViewMenu';

const NAV = () =>
  [
    ['/console', t.nav.console],
    ['/rules', t.nav.rules],
    ['/verify', t.nav.verify],
    ['/after-action', t.nav.afterAction],
    ['/debug', t.nav.debug],
    ['/report', t.nav.report],
  ] as const;

/** One column for the bar and the page, so the wordmark and the title share a left edge. */
const CONTAINER = 'mx-auto w-full max-w-[calc(var(--spacing)*360)] px-5 sm:px-8';

/** Floating bar and page column for /rules, /verify and /debug, in the console's visual system. */
export function PageShell({
  title,
  eyebrow,
  intro,
  aside,
  active,
  children,
}: {
  title: string;
  eyebrow?: string;
  intro?: ReactNode;
  /** Shown beside the title on wide screens (badges, a short status). */
  aside?: ReactNode;
  active?: string;
  children: ReactNode;
}) {
  const { scrollY, scrollYProgress } = useScroll();
  // Hidden until the page moves, so a page too short to scroll never shows a full bar.
  const progressOpacity = useTransform(scrollY, [0, 8], [0, 1]);
  const role = useSessionRole();
  // The Admin link is for clarity only; the server enforces who may manage accounts.
  const nav = role === 'admin' ? [...NAV(), ['/admin', t.nav.admin] as const] : NAV();
  return (
    <div className="relative min-h-dvh bg-shell text-base text-ink-on-shell">
      <div
        aria-hidden
        className="vw-page-glow pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--spacing)*120)]"
      />
      <div className="vw-header sticky top-0 z-30">
        <header className={cn(CONTAINER, 'flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-2')}>
          <Link href="/console" className="flex items-center gap-3">
            <Wordmark plate className="h-12" />
          </Link>
          <SimulatedBadge onShell />
          <nav className="order-last flex w-full gap-1 overflow-x-auto text-body md:order-none md:ml-auto md:w-auto">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={active === href ? 'page' : undefined}
                className={cn(
                  'relative shrink-0 rounded-button px-3 py-1.5 font-medium transition-colors',
                  active === href
                    ? 'bg-brand-from/10 text-ink-on-shell after:absolute after:inset-x-3 after:-bottom-[calc(var(--spacing)*3.5)] after:h-0.5 after:rounded-chip after:bg-brand-from'
                    : 'text-ink-on-shell-muted hover:bg-panel-sunken hover:text-ink-on-shell',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ViewMenu console={false} />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <motion.div
          aria-hidden
          className="vw-progress absolute inset-x-0 bottom-0 h-0.5 origin-left"
          style={{ scaleX: scrollYProgress, opacity: progressOpacity }}
        />
      </div>
      <main className={cn(CONTAINER, 'relative pt-12 pb-20')}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="eyebrow inline-flex items-center gap-2 text-accent-ink">
                <span aria-hidden className="vw-title-bar" />
                {eyebrow}
              </p>
            )}
            <h1 className="mt-2 text-clock font-bold tracking-tight">{title}</h1>
            {intro && (
              <div className="mt-3 max-w-[70ch] text-base text-ink-on-shell-muted">{intro}</div>
            )}
          </div>
          {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
