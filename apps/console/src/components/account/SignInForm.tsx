'use client';

import { EmailSchema, OTP_LENGTH, DISPLAY_NAME_MAX } from '@vighnaway/contracts';
import { Mail } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { useSession } from '@/stores/session';
import { Button } from '@/components/ui/button';

const FIELD = 'min-h-12 rounded-button border border-panel-line bg-panel-sunken px-4 text-base text-ink';
const DEFAULT_EXPIRY_MIN = 10;

/** Seconds left until a deadline (ms epoch), never negative. */
const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));

/** Reads a 429's details.retryAfterS, else a fallback. */
function retryAfter(err: ApiError, fallback: number): number {
  const d = err.details as { retryAfterS?: unknown } | undefined;
  return typeof d?.retryAfterS === 'number' && d.retryAfterS > 0 ? Math.ceil(d.retryAfterS) : fallback;
}

/**
 * Email, then a 6-digit code. The same form serves /login, the control-room gate and /report.
 * The message for a wrong, expired or used code is deliberately the same.
 */
export function SignInForm({ onSignedIn, autoFocus = true }: { onSignedIn?: () => void; autoFocus?: boolean }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      else if (err.code === 'VALIDATION_FAILED') setError(where === 'verify' ? t.account.codeFormat : t.account.invalidEmail);
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
      {error && <p className="text-base font-semibold text-danger-ink">{error}</p>}
    </div>
  );

  if (step === 'email') {
    return (
      <form onSubmit={requestCode} noValidate className="flex flex-col gap-4" aria-label={t.account.title}>
        <p className="text-base text-ink-muted">{t.account.intro}</p>
        <label htmlFor={emailId} className="text-base font-semibold">
          {t.account.emailLabel}
        </label>
        <input
          ref={emailRef}
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
          {...errorProps}
        />
        {errorLine}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || wait > 0}>
            <Mail aria-hidden className="size-5" />
            {busy ? t.account.sending : wait > 0 ? t.account.resendIn(wait) : t.account.sendCode}
          </Button>
          <Button
            variant="outline"
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
    <form onSubmit={verify} noValidate className="flex flex-col gap-4" aria-label={t.account.title}>
      <p className="text-base text-ink-muted">{t.account.codeSent(email, Math.max(1, Math.round(expiresInS / 60)))}</p>
      <label htmlFor={codeId} className="text-base font-semibold">
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
        className={`${FIELD} tabular tracking-widest`}
        {...errorProps}
      />
      <label htmlFor={nameId} className="text-base font-semibold">
        {t.account.nameLabel}
      </label>
      <input id={nameId} name="displayName" type="text" autoComplete="name" maxLength={DISPLAY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} className={FIELD} aria-describedby={`${nameId}-hint`} />
      <p id={`${nameId}-hint`} className="-mt-2 text-meta text-ink-muted">
        {t.account.nameHint}
      </p>
      {errorLine}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? t.account.verifying : t.account.verify}
        </Button>
        <Button variant="outline" onClick={() => void requestCode()} disabled={busy || wait > 0}>
          {wait > 0 ? t.account.resendIn(wait) : t.account.resend}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setStep('email');
            setError(null);
            setCode('');
          }}
        >
          {t.account.changeEmail}
        </Button>
      </div>
    </form>
  );
}
