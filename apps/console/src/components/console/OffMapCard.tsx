'use client';

import { formatSimClock, REPORT_TYPE_LABEL } from '@vighnaway/contracts';
import { MapPinOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, useOffMapReports } from '@/hooks/useOperatorActions';
import { t } from '@/i18n';
import { useOperatorAccess } from '@/lib/credential';
import { clusterOffMap } from '@/lib/offmap';
import { LIVE_SCENARIO } from '@/lib/scenario';

/**
 * Off-map reports (live mode). A person reported something where there is no mapped road, so it created no incident and
 * changes no route. This lists where they cluster, which is where a road map is missing. Nothing here is evidence.
 */
export function OffMapCard() {
  const access = useOperatorAccess();
  const [open, setOpen] = useState(false);
  const q = useOffMapReports(open && !!access);
  const clusters = useMemo(() => clusterOffMap(q.data?.reports ?? []), [q.data]);

  return (
    <>
      <div className="border-t border-shell-hairline px-4 py-3">
        <Button variant="outline" onClick={() => setOpen(true)} className="w-full justify-start" data-testid="offmap-open">
          <MapPinOff aria-hidden className="size-5" />
          {t.offmap.open}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,calc(var(--spacing)*150))]">
          <DialogTitle>{t.offmap.title}</DialogTitle>
          <DialogDescription>{t.offmap.intro}</DialogDescription>
          {!access && <p className="mt-4 text-body text-ink-muted">{t.offmap.operatorOnly}</p>}
          {access && q.isPending && <p className="mt-4 text-body text-ink-muted">{t.offmap.loading}</p>}
          {q.error && (
            <p role="alert" className="mt-4 text-body font-semibold text-danger-ink">
              {t.offmap.failed(errorMessage(q.error))}
            </p>
          )}
          {q.data && q.data.total === 0 && <p className="mt-4 text-body text-ink-muted">{t.offmap.empty}</p>}
          {clusters.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3" data-testid="offmap-clusters">
              {clusters.map((c) => (
                <li key={c.key} className="rounded-card border border-panel-line bg-panel-raised px-4 py-3">
                  <p className="text-body font-semibold text-ink">{t.offmap.cluster(c.count, c.types.map((x) => REPORT_TYPE_LABEL[x]).join(', '))}</p>
                  <p className="tech text-meta text-ink-muted">{`${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`}</p>
                  <p className="text-meta text-ink-muted">{t.offmap.latest(formatSimClock(LIVE_SCENARIO.clockStartsAt, c.latestS, true))}</p>
                </li>
              ))}
            </ul>
          )}
          {q.data && q.data.total > q.data.reports.length && <p className="mt-3 text-meta text-ink-muted">{t.offmap.truncated(q.data.reports.length, q.data.total)}</p>}
          <p className="mt-3 text-meta text-ink-muted">{t.offmap.footnote}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
