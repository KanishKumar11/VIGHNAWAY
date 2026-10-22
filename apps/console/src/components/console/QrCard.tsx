'use client';

import { themes } from '@vighnaway/tokens';
import { ChevronUp, QrCode } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { isLocalOnlyUrl, reportUrl } from '@/lib/env';
import { SCENARIO_ID } from '@/lib/scenario';
import { useScenarioStore } from '@/stores/scenario';

/** QR for /report as a small floating card that expands (DESIGN.md 11.4). */
export function QrCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const scenarioId = useScenarioStore((s) => s.id);
  // The report page posts to the scenario the console shows.
  useEffect(() => setUrl(scenarioId === SCENARIO_ID ? reportUrl() : `${reportUrl()}?scenario=${encodeURIComponent(scenarioId)}`), [scenarioId]);
  return (
    <motion.section layout aria-labelledby="qr-title" className="shrink-0 overflow-hidden border-t border-shell-line" transition={{ type: 'spring', damping: 26, stiffness: 260 }}>
      <motion.button
        layout="position"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t.qr.collapse : t.qr.expand}
        className="flex w-full items-center gap-3 px-5 py-3 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-button bg-panel-sunken text-ink-on-shell">
          <QrCode aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span id="qr-title" className="text-body font-semibold text-ink-on-shell">
            {t.qr.title}
          </span>
          <span className="truncate text-meta text-ink-on-shell-muted">{t.qr.short}</span>
        </span>
        <ChevronUp aria-hidden className={cn('size-5 text-ink-on-shell-muted transition-transform', !open && 'rotate-180')} />
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="qr"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-start gap-4 px-5 pb-4"
          >
            {/* QR codes scan best dark on light, in both themes. */}
            <div className="shrink-0 rounded-card border border-control-border bg-white p-2.5">
              {url ? (
                <QRCodeSVG value={url} size={132} fgColor={themes.light.ink} bgColor={themes.light.white} level="M" marginSize={0} title={t.qr.title} />
              ) : (
                <div className="size-33 rounded-button bg-panel-sunken" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-meta text-ink-on-shell-muted">{t.qr.body}</p>
              {url && <p className="tech mt-2 break-all text-ink-on-shell">{url}</p>}
              {url && isLocalOnlyUrl(url) && <p className="mt-2 text-meta text-warn-ink">{t.qr.localhostHint}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
