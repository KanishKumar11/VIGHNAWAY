'use client';

import {
  Activity,
  ChevronRight,
  KeyRound,
  LogOut,
  Route,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { t } from '@/i18n';
import { useOperatorAccess } from '@/lib/credential';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { useTheme } from '@/stores/theme';
import { royalCssVariables } from '@/lib/theme';
import { LiveRoute } from '@/components/account/LiveRoute';
import { SignInForm } from '@/components/account/SignInForm';
import { OperatorTokenDialog } from '@/components/console/OperatorTokenDialog';
import { Wordmark } from '@/components/shared/BrandMark';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/** The loading and citizen states: one centred card on the page. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6 text-ink-on-shell">
      <main className="flex w-full max-w-[calc(var(--spacing)*140)] flex-col gap-6 rounded-sheet border border-panel-line bg-panel p-8 text-ink shadow-lg">
        {children}
      </main>
    </div>
  );
}

/** A radar behind the headline: rings, cross-hairs and a sweep that turns. Solid shapes only. */
function Radar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={cn('pointer-events-none', className)}
      aria-hidden
      fill="none"
    >
      {[60, 110, 160, 200].map((r) => (
        <circle key={r} cx={200} cy={200} r={r} className="stroke-chrome-line" strokeWidth={1.5} />
      ))}
      <line x1={0} y1={200} x2={400} y2={200} className="stroke-chrome-line" strokeWidth={1.5} />
      <line x1={200} y1={0} x2={200} y2={400} className="stroke-chrome-line" strokeWidth={1.5} />
      <g className="vw-radar">
        <path
          d="M200 200 L200 0 A200 200 0 0 1 341 59 Z"
          className="fill-chrome-accent"
          opacity={0.1}
        />
        <line
          x1={200}
          y1={200}
          x2={200}
          y2={0}
          className="stroke-chrome-accent"
          strokeWidth={2}
          opacity={0.55}
        />
      </g>
      <circle cx={200} cy={200} r={5} className="fill-chrome-accent" />
    </svg>
  );
}

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: TriangleAlert, label: t.queue.title },
  { icon: Activity, label: t.sim.title },
  { icon: Route, label: t.trip.title },
];

/** Staggers an entrance: content rises into place after `delay` ms. */
const rise = (delay: number) => ({ '--d': `${delay}ms` }) as CSSProperties;

/**
 * The signed-out page. Left: the brand panel, a deep surface with a radar, the headline, a live
 * picture of the product and what is inside. Right: the sign-in card on a dotted page. On a phone the
 * panel becomes a compact band above the card. One heading, one form, in DOM order.
 */
function SignInLayout({ children }: { children: ReactNode }) {
  const theme = useTheme((s) => s.theme);
  return (
    <div
      style={{ ...royalCssVariables(theme), fontFamily: 'var(--vw-font-web)' }}
      className="grid min-h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] bg-shell text-ink lg:h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:grid-rows-none lg:overflow-hidden"
    >
      <aside className="relative flex flex-col gap-4 overflow-hidden bg-chrome-bg px-6 py-6 text-chrome-ink sm:px-10 lg:min-h-0 lg:justify-between lg:gap-[clamp(0.75rem,2.4vh,2rem)] lg:px-14 lg:py-[clamp(1.25rem,4.5vh,3rem)]">
        <Radar className="absolute -right-24 -top-24 size-[26rem] opacity-80 lg:-right-16 lg:-top-20 lg:size-[34rem]" />
        <header className="vw-rise relative flex items-center gap-3" style={rise(0)}>
          <div className="flex flex-col gap-1.5">
            <Wordmark className="h-14 sm:h-[4.5rem]" />
            <span className="text-meta text-chrome-ink-muted">{t.app.controlRoom}</span>
          </div>
        </header>
        <div
          className="vw-rise relative flex max-w-[calc(var(--spacing)*130)] flex-col gap-3 lg:gap-5"
          style={rise(120)}
        >
          <h1 className="text-balance text-console-title font-extrabold leading-tight tracking-tight text-chrome-ink lg:text-[clamp(2.25rem,6.4vh,3.5rem)] lg:leading-[1.05]">
            {t.gate.title}
          </h1>
          <p className="hidden text-pretty text-base text-chrome-ink-muted sm:block lg:text-title">
            {t.gate.intro}
          </p>
        </div>
        <div className="vw-rise hidden min-h-0 flex-1 items-center justify-center lg:flex">
          <LiveRoute className="size-full" />
        </div>
        <ul
          className="vw-rise relative hidden flex-wrap gap-3 lg:flex [@media(max-height:640px)]:hidden"
          style={rise(240)}
        >
          {FEATURES.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2.5 rounded-full border border-chrome-line bg-chrome-fill py-1.5 pl-1.5 pr-4 text-body font-semibold text-chrome-ink"
            >
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-full bg-chrome-accent text-chrome-on-accent"
              >
                <Icon className="size-[18px]" strokeWidth={2.2} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <main className="relative flex items-start justify-center overflow-hidden px-6 py-6 sm:px-10 lg:min-h-0 lg:items-center lg:px-14 lg:py-[clamp(0.75rem,3.5vh,3rem)]">
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
          <pattern id="vw-dots" width={26} height={26} patternUnits="userSpaceOnUse">
            <circle cx={2} cy={2} r={1.6} className="fill-control-border" opacity={0.28} />
          </pattern>
          <rect width="100%" height="100%" fill="url(#vw-dots)" />
        </svg>
        <div
          className="vw-rise relative w-full max-w-[calc(var(--spacing)*118)] overflow-hidden rounded-sheet border border-panel-line bg-panel shadow-lg"
          style={rise(180)}
        >
          <div aria-hidden className="h-1.5 bg-accent" />
          <div className="flex flex-col gap-5 p-6 sm:p-8 lg:gap-[clamp(0.875rem,2.6vh,2rem)] lg:p-[clamp(1.25rem,3.6vh,2.5rem)]">
            <header className="hidden items-center gap-4 lg:flex">
              <span
                aria-hidden
                className="grid size-[clamp(2.5rem,6vh,3.5rem)] shrink-0 place-items-center rounded-card bg-accent text-on-accent shadow-md"
              >
                <ShieldCheck className="size-7" strokeWidth={2} />
              </span>
              <div className="flex flex-col leading-tight">
                <h2 className="text-title font-bold text-ink">{t.account.title}</h2>
                <span className="text-body text-ink-muted">{t.app.controlRoom}</span>
              </div>
            </header>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Decides what /console shows. The control room itself needs an operator or admin session, or the
 * legacy demo token. A signed-in citizen is told plainly why not. This is for clarity: the server
 * rejects operator actions from anyone without a credential, whatever the page shows.
 */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const access = useOperatorAccess();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);

  useEffect(() => {
    useOperator.getState().hydrate();
    void useSession.getState().hydrate();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <Frame>
        <p role="status" className="text-base text-ink-muted">
          {t.gate.loading}
        </p>
      </Frame>
    );
  }

  if (access) return <>{children}</>;

  if (user) {
    // Signed in, but a citizen: no operator control is rendered at all.
    return (
      <Frame>
        <div className="flex items-center gap-3">
          <ShieldAlert aria-hidden className="size-8 shrink-0 text-warn-ink" />
          <h1 className="text-console-title font-semibold">{t.gate.citizenTitle}</h1>
        </div>
        <p className="text-base text-ink-muted">{t.gate.citizenBody(user.email)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/report" className={cn(buttonVariants({ variant: 'primary' }))}>
            {t.gate.reportLink}
          </Link>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-5" />
            {t.account.signOut}
          </Button>
        </div>
        <OperatorTokenDialog />
      </Frame>
    );
  }

  return (
    <SignInLayout>
      <SignInForm showSteps />
      <div className="flex flex-col gap-3 border-t border-panel-line pt-6">
        <Button
          variant="outline"
          onClick={() => useOperator.getState().openDialog()}
          className="w-full justify-start gap-3 whitespace-normal px-4 py-2 text-body sm:text-base"
        >
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-button bg-panel-sunken text-ink-muted"
          >
            <KeyRound className="size-[18px]" />
          </span>
          <span className="flex-1 text-left">{t.gate.demoAccess}</span>
          <ChevronRight aria-hidden className="size-5 text-ink-subtle" />
        </Button>
        <p className="text-meta text-ink-muted [@media(max-height:760px)]:hidden">
          {t.gate.demoAccessHint}
        </p>
      </div>
      <OperatorTokenDialog />
    </SignInLayout>
  );
}
