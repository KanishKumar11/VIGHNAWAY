'use client';

import { formatSimClock } from '@vighnaway/contracts';
import { History } from 'lucide-react';
import { motion } from 'motion/react';
import { t } from '@/i18n';
import { useActiveScenario } from '@/stores/scenario';
import { useReplay } from '@/stores/replay';

/** "Replaying 14:08 · Back to live": the console is showing a past decision, read-only. */
export function ReplayPill({ atS }: { atS: number }) {
  const scenario = useActiveScenario();
  const exit = useReplay((s) => s.exit);
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto flex items-center gap-3 rounded-button border border-control-border bg-panel py-1.5 pr-1.5 pl-4 text-body text-ink shadow-md"
    >
      <History aria-hidden className="size-4" />
      <span className="font-semibold">{t.replay.replaying(formatSimClock(scenario.clockStartsAt, atS))}</span>
      <span className="text-meta text-ink-muted">{t.replay.readOnly}</span>
      <button type="button" onClick={exit} className="vw-press h-9 rounded-button bg-accent px-3.5 text-meta font-semibold text-on-accent">
        {t.replay.backToLive}
      </button>
    </motion.div>
  );
}
