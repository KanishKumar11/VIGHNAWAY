'use client';

import { themes } from '@vighnaway/tokens';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { isLocalOnlyUrl, reportUrl } from '@/lib/env';
import { SCENARIO_ID } from '@/lib/scenario';
import { useScenarioStore } from '@/stores/scenario';

/**
 * Presenter mode: a large QR code to /report so the room can file a hazard from their own phones and
 * watch it move from Unverified to Corroborated (a second device) and to Verified (only when the
 * operator verifies it). It adds to the scripted demo; it never replaces it.
 */
export function AudienceCard() {
  const [url, setUrl] = useState<string | null>(null);
  const scenarioId = useScenarioStore((s) => s.id);
  useEffect(() => setUrl(scenarioId === SCENARIO_ID ? reportUrl() : `${reportUrl()}?scenario=${encodeURIComponent(scenarioId)}`), [scenarioId]);
  return (
    <section
      aria-labelledby="audience-title"
      data-testid="audience-card"
      className="panel-card pointer-events-auto flex w-max max-w-[calc(var(--spacing)*130)] items-center gap-6 p-5"
    >
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
    </section>
  );
}
