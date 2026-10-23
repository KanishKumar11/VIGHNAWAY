'use client';

import { EmailSchema, OTP_LENGTH, DISPLAY_NAME_MAX } from '@vighnaway/contracts';
import { ArrowRight, Check, Mail, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { markNameAsked, nameAlreadyAsked } from '@/lib/storage';
import { useSession } from '@/stores/session';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

const FIELD =
  'min-h-14 w-full rounded-button border border-control-border/40 bg-panel-sunken px-4 text-base text-ink placeholder:text-ink-subtle transition-colors hover:border-control-border focus-visible:border-accent focus-visible:bg-panel';
const LABEL = 'text-body font-semibold text-ink';
/** The two small buttons under the code form: wrap and centre their text instead of clipping it. */
const SECONDARY = 'min-h-14 whitespace-normal px-3 text-center text-body leading-snug tabular';
const DEFAULT_EXPIRY_MIN = 10;

/** Two steps, email then code: a numbered dot each, the current one filled with the accent. */
function Stepper({ step }: { step: 'email' | 'code' }) {
  const items = [
    { key: 'email', label: t.account.emailLabel },
    { key: 'code', label: t.account.codeLabel },
  ] as const;
  const at = step === 'email' ? 0 : 1;
  return (
    <ol className="flex items-center gap-3">
      {items.map((it, i) => (
        <li
          key={it.key}
          aria-current={i === at ? 'step' : undefined}
          className="flex flex-1 items-center gap-3 last:flex-none"
        >
          <span
            aria-hidden
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full text-meta font-bold transition-colors',
              i < at
                ? 'bg-ink text-panel'
                : i === at
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'border border-panel-line bg-panel-sunken text-ink-subtle',
            )}
          >
            {i < at ? <Check className="size-4" strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={cn('text-meta font-semibold', i === at ? 'text-ink' : 'text-ink-subtle')}
          >
            {it.label}
          </span>
          {i < items.length - 1 ? (
            <span
              aria-hidden
              className={cn('h-0.5 flex-1 rounded-full', i < at ? 'bg-ink' : 'bg-panel-line')}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Seconds left until a deadline (ms epoch), never negative. */
const secondsLeft = (deadline: number, now: number) =>
  Math.max(0, Math.ceil((deadline - now) / 1000));

/** Reads a 429's details.retryAfterS, else a fallback. */
function retryAfter(err: ApiError, fallback: number): number {
  const d = err.details as { retryAfterS?: unknown } | undefined;
  return typeof d?.retryAfterS === 'number' && d.retryAfterS > 0
    ? Math.ceil(d.retryAfterS)
    : fallback;
}

/**
 * Email, then a 6-digit code. The same form serves /login, the control-room gate and /report.
 * The message for a wrong, expired or used code is deliberately the same.
 */
export function SignInForm({
  onSignedIn,
  autoFocus = true,
  showSteps = false,
}: {
  onSignedIn?: () => void;
  autoFocus?: boolean;
  /** Show the two-step indicator (the sign-in page). */
  showSteps?: boolean;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // True from a correct code until this form goes away, so the button keeps turning instead of springing back.
  const [signedIn, setSignedIn] = useState(false);
  const [expiresInS, setExpiresInS] = useState(DEFAULT_EXPIRY_MIN * 60);
  // Resend countdown: a deadline plus a ticking "now", so it stays right if the tab sleeps.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const emailId = `${ids}-email`;
  const codeId = `${ids}-code`;
  const nameId = `${ids}-name`;
  const errorId = `${ids}-error`;
  const wait = secondsLeft(resendAt, now);
  const askName = step === 'code' && !nameAlreadyAsked(email);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus follows the step.
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
    else if (autoFocus) emailRef.current?.focus();
  }, [step, autoFocus]);

  const startWait = (s: number) => {
    const t0 = Date.now();
    setNow(t0);
    setResendAt(t0 + s * 1000);
  };

  function fail(err: unknown, where: 'request' | 'verify') {
    if (err instanceof ApiError) {
      if (err.code === 'RATE_LIMITED') {
        const s = retryAfter(err, 60);
        startWait(s);
        setError(t.account.rateLimited(s));
      } else if (err.code === 'NETWORK') setError(t.operator.unreachable(API_URL));
      else if (where === 'verify' && err.code === 'UNAUTHORIZED') setError(t.account.invalidCode);
      else if (err.code === 'VALIDATION_FAILED')
        setError(where === 'verify' ? t.account.codeFormat : t.account.invalidEmail);
      // The route itself is missing: the API is an older build than this app.
      else if (err.code === 'NOT_FOUND') setError(t.account.serverOutdated);
      else setError(t.account.generic(err.message));
    } else setError(t.account.generic(err instanceof Error ? err.message : String(err)));
  }

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy || wait > 0) return;
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t.account.invalidEmail);
      emailRef.current?.focus();
      return;
    }
    setEmail(parsed.data);
    setBusy(true);
    setError(null);
    try {
      const r = await api.otpRequest(parsed.data);
      setExpiresInS(r.expiresInS);
      startWait(r.resendAfterS);
      setCode('');
      setStep('code');
    } catch (err) {
      fail(err, 'request');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (code.length !== OTP_LENGTH) {
      setError(t.account.codeFormat);
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const displayName = name.trim();
      const resp = await api.otpVerify({ email, code, ...(displayName ? { displayName } : {}) });
      setSignedIn(true);
      // The name is only used when a sign-in creates the account: never ask this browser for it again.
      markNameAsked(email);
      useSession.getState().setSession(resp);
      setCode('');
      onSignedIn?.();
    } catch (err) {
      fail(err, 'verify');
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  // Paste friendly: keep digits only, at most six ("123 456" and "123-456" both work).
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, OTP_LENGTH);
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    e.preventDefault();
    setCode(digits(pasted));
  };

  const errorProps = error ? ({ 'aria-invalid': true, 'aria-describedby': errorId } as const) : {};
  const errorLine = (
    <div aria-live="assertive" role="alert" id={errorId} className="min-h-0">
      {error && (
        <div className="flex items-start gap-3 rounded-button border border-danger-ink/25 bg-danger-surface px-4 py-3">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-ink" />
          <p className="text-body font-semibold text-danger-ink">{error}</p>
        </div>
      )}
    </div>
  );

  if (step === 'email') {
    return (
      <form
        onSubmit={requestCode}
        noValidate
        className="flex flex-col gap-5"
        aria-label={t.account.title}
      >
        {showSteps ? <Stepper step="email" /> : null}
        <p
          className={cn(
            'text-base text-ink-muted',
            showSteps && '[@media(max-height:700px)]:hidden',
          )}
        >
          {t.account.intro}
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor={emailId} className={LABEL}>
            {t.account.emailLabel}
          </label>
          <div className="relative">
            <Mail
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-subtle"
            />
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder={t.account.emailPlaceholder}
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${FIELD} pl-12`}
              {...errorProps}
            />
          </div>
        </div>
        {errorLine}
        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={busy || wait > 0}
            className="w-full shadow-md"
          >
            {busy ? t.account.sending : wait > 0 ? t.account.resendIn(wait) : t.account.sendCode}
            {busy ? <Spinner /> : <ArrowRight aria-hidden className="size-5" />}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              const parsed = EmailSchema.safeParse(email);
              if (!parsed.success) {
                setError(t.account.invalidEmail);
                emailRef.current?.focus();
                return;
              }
              setEmail(parsed.data);
              setError(null);
              setStep('code');
            }}
          >
            {t.account.haveCode}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={verify} noValidate className="flex flex-col gap-5" aria-label={t.account.title}>
      {showSteps ? <Stepper step="code" /> : null}
      <p className="text-base text-ink-muted">
        {t.account.codeSent(email, Math.max(1, Math.round(expiresInS / 60)))}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor={codeId} className={LABEL}>
          {t.account.codeLabel}
        </label>
        <input
          ref={codeRef}
          id={codeId}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          placeholder={t.account.codeHint}
          value={code}
          onChange={(e) => setCode(digits(e.target.value))}
          onPaste={onPaste}
          className={`${FIELD} tabular text-title tracking-widest`}
          {...errorProps}
        />
      </div>
      {askName ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className={LABEL}>
            {t.account.nameLabel}
          </label>
          <input
            id={nameId}
            name="displayName"
            type="text"
            autoComplete="name"
            placeholder={t.account.namePlaceholder}
            maxLength={DISPLAY_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
            aria-describedby={`${nameId}-hint`}
          />
          <p id={`${nameId}-hint`} className="text-meta text-ink-muted">
            {t.account.nameHint}
          </p>
        </div>
      ) : null}
      {errorLine}
      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy || signedIn}
          aria-busy={busy || signedIn}
          className="w-full shadow-md"
        >
          {busy || signedIn ? t.account.verifying : t.account.verify}
          {busy || signedIn ? <Spinner /> : null}
        </Button>
        {/* Both labels may wrap and stay centred, and the countdown uses tabular figures so it never shifts as it ticks. */}
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Button
            variant="outline"
            className={SECONDARY}
            onClick={() => void requestCode()}
            disabled={busy || wait > 0}
          >
            {wait > 0 ? t.account.resendIn(wait) : t.account.resend}
          </Button>
          <Button
            variant="outline"
            className={SECONDARY}
            onClick={() => {
              setStep('email');
              setError(null);
              setCode('');
            }}
          >
            {t.account.changeEmail}
          </Button>
        </div>
      </div>
    </form>
  );
}
