'use client';

import { formatDuration, formatSimClock } from '@vighnaway/contracts';
import type { Incident } from '@vighnaway/contracts';
import { themes } from '@vighnaway/tokens';
import { Check, Copy, ExternalLink, ReceiptText } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { t } from '@/i18n';
import { routeLabel } from '@/i18n/engineText';
import { verifyUrl } from '@/lib/env';
import { makeReceipt, type MadeReceipt } from '@/lib/receipt';
import { incidentList } from '@/lib/sync';
import { useActiveScenario } from '@/stores/scenario';
import { useLiveStore } from '@/stores/live';

/**
 * Decision receipt for the trip shown: a frozen snapshot of the inputs (incident seq, simulation
 * time, trip) and the decision's hash, with a QR code that opens /verify on any machine. Made on
 * demand, not on every clock tick, so the code stays put while it is being scanned.
 */
export function ReceiptCard({ destinationId }: { destinationId: string }) {
  const scenario = useActiveScenario();
  const [made, setMade] = useState<{ value: MadeReceipt; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    const live = useLiveStore.getState();
    const incidents: Incident[] = incidentList(live.sync);
    const value = makeReceipt(scenario, incidents, live.sync.lastSeq, live.simTimeS, destinationId);
    setMade({ value, url: verifyUrl(value.token) });
    setCopied(false);
  };

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const rec = made?.value.plan.routes.find((r) => r.routeId === made.value.plan.recommendedRouteId);
  const hash = made ? made.value.receipt.planHash.slice(0, 8) : '';
  return (
    <section aria-labelledby="receipt-title" className="border-t border-shell-line px-6 py-4" data-testid="receipt-card">
      <div className="flex items-center gap-3">
        <ReceiptText aria-hidden className="size-4.5 shrink-0 text-ink-on-shell-muted" />
        <h3 id="receipt-title" className="min-w-0 flex-1 text-meta font-semibold text-ink-on-shell-muted">
          {t.receipt.title}
        </h3>
        <button
          type="button"
          onClick={create}
          className="rounded-button border border-control-border bg-panel-raised px-3 py-1.5 text-meta font-semibold text-ink hover:bg-panel-sunken"
        >
          {made ? t.receipt.renew : t.receipt.create}
        </button>
      </div>
      {!made ? (
        <p className="mt-2 text-meta text-ink-on-shell-muted">{t.receipt.intro}</p>
      ) : (
        <div className="mt-3 flex items-start gap-4">
          {/* QR codes scan best dark on light, in both themes. */}
          <div className="shrink-0 rounded-card border border-control-border bg-white p-2.5">
            <QRCodeSVG value={made.url} size={112} fgColor={themes.light.ink} bgColor={themes.light.white} level="M" marginSize={0} title={t.receipt.qrLabel} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="tech text-body font-semibold text-ink-on-shell" data-testid="receipt-hash">
              {t.receipt.decision(hash)}
            </p>
            <p className="mt-0.5 text-meta text-ink-on-shell-muted">{t.receipt.snapshot(formatSimClock(scenario.clockStartsAt, made.value.receipt.evaluatedAtS), made.value.receipt.seq)}</p>
            {rec && (
              <p className="mt-1 text-meta text-ink-on-shell">
                {routeLabel(rec)}, {formatDuration(rec.etaS)}
              </p>
            )}
            {made.value.receipt.simulated && <p className="mt-1 text-meta font-semibold text-ink-on-shell-muted">{t.app.simulated}</p>}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a
                href={made.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-button border border-control-border px-2.5 py-1.5 text-meta font-semibold text-ink-on-shell hover:bg-panel-sunken"
              >
                <ExternalLink aria-hidden className="size-3.5" />
                {t.receipt.open}
              </a>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-button border border-control-border px-2.5 py-1.5 text-meta font-semibold text-ink-on-shell hover:bg-panel-sunken"
              >
                {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                {copied ? t.receipt.copied : t.receipt.copy}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
