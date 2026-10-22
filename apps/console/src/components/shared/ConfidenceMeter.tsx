import type { Confidence } from '@vighnaway/contracts';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

const FILLED: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

/** Three segments plus the word. Never a percentage. Static: confidence is read, not felt. */
export function ConfidenceMeter({ confidence, className }: { confidence: Confidence; className?: string; onShell?: boolean }) {
  const n = FILLED[confidence];
  const word = t.route.confidence[confidence];
  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-label={t.route.confidenceLabel(word)} role="img">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1.5 w-5 rounded-chip', i <= n ? 'bg-ink' : 'bg-panel-line')} />
        ))}
      </div>
      <span className="text-meta font-semibold text-ink">{t.route.confidenceLabel(word)}</span>
    </div>
  );
}
