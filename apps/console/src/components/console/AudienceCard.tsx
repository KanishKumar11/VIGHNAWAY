'use client';

import { themes } from '@vighnaway/tokens';
import { Check, Circle, CircleDot } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { t } from '@/i18n';
import { audienceIncidents, audienceLadder, newestAudienceIncident, type LadderState } from '@/lib/audience';
import { cn } from '@/lib/cn';
import { isLocalOnlyUrl, reportUrl } from '@/lib/env';
import { SCENARIO_ID } from '@/lib/scenarios';
import { useClearAudience } from '@/hooks/useOperatorActions';
import { displayIncidents, useLiveStore } from '@/stores/live';
import { useScenarioStore } from '@/stores/scenario';

/** The QR target for the room: the report page in audience mode, for the scenario the console shows. */
export function audienceUrl(scenarioId: string, base: string = reportUrl()): string {
  const params = new URLSearchParams();
  if (scenarioId !== SCENARIO_ID) params.set('scenario', scenarioId);
  params.set('audience', '1');
  return `${base}?${params.toString()}`;
}

const ICON: Record<LadderState, typeof Check> = { done: Check, current: CircleDot, todo: Circle };

/**
 * Presenter mode: a large QR code to /report so the room can file a hazard from their own phones and
 * watch it move from Unverified to Corroborated (a second device) and to Verified (only when the
 * operator verifies it). It adds to the scripted demo; it never replaces it. The operator can clear
 * the audience's reports in one action.
 */
export function AudienceCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const scenarioId = useScenarioStore((s) => s.id);
  const live = useLiveStore((s) => s);
  const clear = useClearAudience();
  useEffect(() => setUrl(audienceUrl(scenarioId)), [scenarioId]);

  const all = useMemo(() => displayIncidents(live), [live]);
  const newest = useMemo(() => newestAudienceIncident(all), [all]);
  const open = useMemo(() => audienceIncidents(all), [all]);
  const ladder = audienceLadder(newest);

  return (
    <section
      aria-labelledby="audience-title"
      data-testid="audience-card"
      className="panel-card pointer-events-auto flex w-max max-w-[calc(var(--spacing)*150)] flex-col gap-5 p-5"
    >
      <div className="flex items-center gap-6">
        {/* QR codes scan best dark on light, in both themes. */}
        <div className="shrink-0 rounded-card border border-control-border bg-white p-3">
          {url ? (
            <QRCodeSVG value={url} size={176} fgColor={themes.light.ink} bgColor={themes.light.white} level="M" marginSize={0} title={t.audience.qrLabel} />
          ) : (
            <div className="size-44 rounded-button bg-panel-sunken" />
          )}
        </div>
        <div className="min-w-0">
          <h2 id="audience-title" className="text-console-title font-semibold text-ink-on-shell">
            {t.audience.title}
          </h2>
          <ol className="mt-2 flex flex-col gap-1.5 text-body text-ink-on-shell-muted">
            {t.audience.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="tabular font-semibold text-ink-on-shell">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {url && <p className="tech mt-3 break-all text-meta text-ink-on-shell">{url}</p>}
          {url && isLocalOnlyUrl(url) && <p className="mt-1.5 text-meta text-warn-ink">{t.qr.localhostHint}</p>}
        </div>
      </div>

      <div className="border-t border-shell-line pt-4" aria-live="polite">
        <h3 className="text-meta font-semibold text-ink-on-shell-muted">{t.audience.ladderTitle}</h3>
        {newest ? (
          <ol className="mt-2 flex flex-col gap-1.5" data-testid="audience-ladder">
            {ladder.map(({ step, state }) => {
              const Icon = ICON[state];
              return (
                <li key={step} data-step={step} data-state={state} className={cn('flex items-start gap-2.5 text-body', state === 'todo' ? 'text-ink-on-shell-muted' : 'font-medium text-ink-on-shell')}>
                  <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', state === 'current' && 'text-accent-ink')} />
                  <span>
                    {t.audience.ladder[step]}
                    {state === 'current' && <span className="sr-only"> ({newest.roadName ?? ''})</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-body text-ink-on-shell-muted">{t.audience.ladderEmpty}</p>
        )}
        {open.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {confirming ? (
              <>
                <p className="text-body text-ink-on-shell" role="alert">
                  {t.audience.clearAsk(open.length)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    clear.mutate();
                  }}
                  className="rounded-button bg-danger-surface px-3 py-1.5 text-meta font-semibold text-danger-ink"
                >
                  {t.audience.clearConfirm}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-button border border-control-border px-3 py-1.5 text-meta font-semibold text-ink-on-shell">
                  {t.audience.clearCancel}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="rounded-button border border-control-border px-3 py-1.5 text-meta font-semibold text-ink-on-shell hover:bg-panel-sunken" data-testid="audience-clear">
                {t.audience.clear}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
