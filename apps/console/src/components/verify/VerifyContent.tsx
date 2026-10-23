'use client';

import { formatDuration, formatSimClock } from '@vighnaway/contracts';
import type { ReceiptCheck } from '@vighnaway/engine';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/shared/PageShell';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n';
import { routeLabel } from '@/i18n/engineText';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { parseReceipt, tokenFromText, type VerifyOutcome } from '@/lib/receiptParse';

type State = { phase: 'idle' } | { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'done'; outcome: VerifyOutcome };

const short = (s: string): string => (s.length > 18 ? `${s.slice(0, 16)}…` : s);

/** Checks a decision receipt against the server's recorded history. Everything is computed here, in the browser. */
export function VerifyContent() {
  const [text, setText] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });

  const run = useCallback(async (input: string) => {
    const receipt = parseReceipt(input);
    if (!receipt) {
      setState({ phase: 'done', outcome: { kind: 'invalid' } });
      return;
    }
    setState({ phase: 'loading' });
    try {
      const history = await api.history(receipt.scenarioId);
      // Re-running the decision needs the road graph: it downloads now, not with the page.
      const { verifyAgainstHistory } = await import('@/lib/receipt');
      setState({ phase: 'done', outcome: verifyAgainstHistory(receipt, history) });
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // A scanned QR code opens /verify?r=<token>: check it straight away.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('r');
    if (r) {
      setText(r);
      void run(r);
    }
  }, [run]);

  return (
    <PageShell title={t.verify.title} eyebrow={t.verify.eyebrow} active="/verify" intro={<p>{t.verify.intro}</p>}>
      <form
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-meta font-semibold text-ink-on-shell-muted">{t.verify.pasteLabel}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.verify.pastePlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="tech h-11 rounded-button border border-control-border bg-panel-raised px-3 text-body text-ink"
          />
        </label>
        <button type="submit" disabled={!tokenFromText(text)} className="h-11 rounded-button bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-50">
          {t.verify.check}
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {state.phase === 'loading' && (
          <div role="status" className="flex flex-col gap-3">
            <p className="text-body text-ink-on-shell-muted">{t.verify.loading}</p>
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {state.phase === 'error' && <Banner tone="warn" title={t.verify.fetchFailed(state.message)} />}
        {state.phase === 'done' && <Outcome outcome={state.outcome} />}
      </div>
    </PageShell>
  );
}

function Banner({ tone, title, body }: { tone: 'ok' | 'warn'; title: string; body?: string }) {
  const Icon = tone === 'ok' ? CircleCheck : TriangleAlert;
  return (
    <div
      role={tone === 'ok' ? 'status' : 'alert'}
      className={cn('flex items-start gap-3.5 rounded-card border px-5 py-4', tone === 'ok' ? 'border-accent bg-accent-surface' : 'border-warn bg-warn-surface')}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-6 shrink-0', tone === 'ok' ? 'text-accent-ink' : 'text-warn')} />
      <div>
        <p className={cn('text-title font-semibold', tone === 'ok' ? 'text-accent-ink' : 'text-warn-ink')}>{title}</p>
        {body && <p className={cn('mt-1 text-body', tone === 'ok' ? 'text-accent-ink' : 'text-warn-ink')}>{body}</p>}
      </div>
    </div>
  );
}

export function Outcome({ outcome }: { outcome: VerifyOutcome }) {
  if (outcome.kind === 'invalid') return <Banner tone="warn" title={t.verify.invalid} />;
  if (outcome.kind === 'unknown_scenario') return <Banner tone="warn" title={t.verify.unknownScenario(outcome.receipt.scenarioId)} />;
  const { receipt, scenario, verification, incidentCount } = outcome;
  const plan = verification.plan;
  const rec = plan.routes.find((r) => r.routeId === plan.recommendedRouteId);
  const inputsOff = verification.checks.some((c) => c.name === 'inputs' && !c.ok);
  const checkLabel = (c: ReceiptCheck) => t.verify.checks[c.name];
  return (
    <div className="flex flex-col gap-8">
      {verification.same ? (
        <Banner tone="ok" title={t.verify.same(receipt.planHash.slice(0, 4))} body={t.verify.sameBody} />
      ) : (
        <Banner tone="warn" title={t.verify.differs} body={`${t.verify.differsBody}${inputsOff ? ` ${t.verify.inputsHint}` : ''}`} />
      )}

      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        {[
          [t.verify.meta.scenario, receipt.simulated ? `${scenario.name} · ${t.verify.simulated}` : scenario.name],
          [t.verify.meta.snapshot, t.verify.snapshotValue(receipt.seq)],
          [t.verify.meta.evaluated, formatSimClock(scenario.clockStartsAt, receipt.evaluatedAtS)],
          [t.verify.meta.incidents, String(incidentCount)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-shell-line py-2">
            <dt className="text-meta font-semibold text-ink-on-shell-muted">{k}</dt>
            <dd className="text-body text-ink-on-shell">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="text-body text-ink-on-shell">{rec ? t.verify.recommendation(routeLabel(rec), formatDuration(rec.etaS)) : t.verify.noRoute}</p>

      <section aria-labelledby="checks-title">
        <h2 id="checks-title" className="text-console-title font-semibold">
          {t.verify.checksTitle}
        </h2>
        <table className="mt-3 w-full text-left text-body">
          <thead>
            <tr className="border-b border-shell-line text-meta text-ink-on-shell-muted">
              <td className="py-2 pr-4" />
              <th className="py-2 pr-4 font-semibold" scope="col">
                {t.verify.receiptValue}
              </th>
              <th className="py-2 pr-4 font-semibold" scope="col">
                {t.verify.recomputed}
              </th>
              <td className="py-2" />
            </tr>
          </thead>
          <tbody>
            {verification.checks.map((c) => (
              <tr key={c.name} className="border-b border-shell-line">
                <th scope="row" className="py-2.5 pr-4 font-medium text-ink-on-shell">
                  {checkLabel(c)}
                </th>
                <td className="tech py-2.5 pr-4 text-ink-on-shell-muted">{short(c.expected)}</td>
                <td className="tech py-2.5 pr-4 text-ink-on-shell-muted">{short(c.actual)}</td>
                <td className={cn('py-2.5 text-right text-meta font-semibold', c.ok ? 'text-accent-ink' : 'text-warn-ink')}>{c.ok ? t.verify.ok : t.verify.mismatch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-console-title font-semibold">{t.verify.proves}</h2>
          <p className="mt-2 text-body text-ink-on-shell-muted">{t.verify.provesBody}</p>
        </div>
        <div>
          <h2 className="text-console-title font-semibold">{t.verify.notProves}</h2>
          <p className="mt-2 text-body text-ink-on-shell-muted">{t.verify.notProvesBody}</p>
        </div>
      </section>
    </div>
  );
}
