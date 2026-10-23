'use client';

import { ReportInputSchema } from '@vighnaway/contracts';
import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { sendReport } from '@/lib/sendReport';
import { reportForAskAnswer, type AskAnswer, type AskLink } from '@/lib/ask';
import { cn } from '@/lib/cn';
import { getDeviceId } from '@/lib/storage';

type Phase = 'ask' | 'sending' | { done: AskAnswer | 'already' };

const button = 'min-h-14 rounded-button px-3 text-body font-semibold disabled:opacity-60';

/**
 * One question about one road, opened from a shared link (/report?ask=lat,lng&road=name). Answers
 * are ordinary reports with origin "prompt": Unverified, never auto-verified, and a No never
 * resolves an incident. The road name comes from the link and is shown as plain text.
 */
export function AskForm({ scenarioId, link }: { scenarioId: string; link: AskLink }) {
  const [phase, setPhase] = useState<Phase>('ask');
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => setDeviceId(getDeviceId()), []);

  async function answer(a: AskAnswer) {
    const input = reportForAskAnswer(link, a, deviceId);
    if (!input) {
      setPhase({ done: a });
      return;
    }
    const parsed = ReportInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(t.report.errors.generic(parsed.error.issues[0]?.message ?? ''));
      return;
    }
    setError(null);
    setPhase('sending');
    try {
      await sendReport(scenarioId, parsed.data);
      setPhase({ done: a });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === 'CONFLICT') {
        setPhase({ done: 'already' });
        return;
      }
      setError(
        code === 'NOT_ON_ROAD'
          ? t.report.errors.notOnRoad
          : code === 'RATE_LIMITED'
            ? t.report.errors.rateLimited
            : code === 'NETWORK'
              ? t.report.errors.network
              : t.report.errors.generic(err instanceof Error ? err.message : String(err)),
      );
      setPhase('ask');
    }
  }

  const done = typeof phase === 'object' ? phase.done : null;
  const sending = phase === 'sending';

  return (
    <section aria-labelledby="ask-title" className="mx-4 flex flex-col gap-5 rounded-card border border-panel-line bg-panel p-5 shadow-sm">
      <p className="text-meta font-semibold tracking-eyebrow text-ink-muted uppercase">{t.report.ask.eyebrow}</p>
      <h2 id="ask-title" className="text-console-title font-semibold">
        {t.report.ask.question(link.road ?? t.report.ask.unnamedRoad)}
      </h2>
      <p className="text-body text-ink-muted">{t.report.ask.why}</p>

      {done === null ? (
        <>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.report.ask.title}>
            <button type="button" disabled={sending || !deviceId} onClick={() => answer('yes')} className={cn(button, 'bg-flood-prone text-ink')}>
              {t.report.ask.yes}
            </button>
            <button type="button" disabled={sending || !deviceId} onClick={() => answer('no')} className={cn(button, 'bg-accent text-on-accent')}>
              {t.report.ask.no}
            </button>
            <button type="button" disabled={sending} onClick={() => answer('not_sure')} className={cn(button, 'bg-panel-sunken text-ink')}>
              {t.report.ask.notSure}
            </button>
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-2 text-body font-semibold text-danger-ink">
              <CircleAlert aria-hidden className="size-4.5 shrink-0" />
              {error}
            </p>
          )}
          <p className="text-meta text-ink-muted">{t.report.ask.note}</p>
        </>
      ) : (
        <p role="status" className="flex items-start gap-2 text-body font-semibold">
          <CircleCheck aria-hidden className="mt-0.5 size-4.5 shrink-0" />
          {done === 'yes' ? t.report.ask.thanksYes : done === 'no' ? t.report.ask.thanksNo : done === 'already' ? t.report.ask.alreadyAnswered : t.report.ask.thanksNotSure}
        </p>
      )}

      <Link href={`/report?scenario=${encodeURIComponent(scenarioId)}`} className="text-body font-semibold text-accent underline">
        {t.report.ask.more}
      </Link>
    </section>
  );
}
