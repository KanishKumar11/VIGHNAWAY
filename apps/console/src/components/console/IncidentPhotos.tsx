'use client';

import { formatSimClock } from '@vighnaway/contracts';
import { ChevronLeft, ChevronRight, ImageOff, Lock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePhotoUrl, type IncidentPhoto } from '@/hooks/useIncidentPhotos';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { activeScenario } from '@/stores/scenario';

/** Thumbnails shown before "+N". */
export const MAX_THUMBS = 3;

const tile = 'relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-button border border-shell-line bg-panel-sunken';

/** Untrusted user content: it only ever becomes the src of an <img>, never markup. */
function Thumb({ photo, nowS, onOpen }: { photo: IncidentPhoto; nowS: number; onOpen: () => void }) {
  const state = usePhotoUrl(photo.reportId);
  const label = t.queue.photoAlt(t.time.age(nowS - photo.atS));
  return (
    <button type="button" className={cn(tile, 'vw-press hover:border-shell-hairline-strong')} aria-label={label} onClick={onOpen}>
      {state.status === 'ready' ? (
        <img src={state.url} alt="" draggable={false} className="size-full object-cover" />
      ) : state.status === 'error' ? (
        <ImageOff aria-hidden className="size-5 text-ink-on-shell-muted" />
      ) : (
        <Skeleton className="size-full rounded-none" />
      )}
    </button>
  );
}

function Viewer({ photo, nowS, index, count }: { photo: IncidentPhoto; nowS: number; index: number; count: number }) {
  const state = usePhotoUrl(photo.reportId);
  const age = t.time.age(nowS - photo.atS);
  return (
    <>
      <DialogTitle>{t.queue.photoTitle}</DialogTitle>
      <DialogDescription>
        {t.queue.photoTaken(formatSimClock(activeScenario().clockStartsAt, photo.atS), age)}
        {count > 1 && <span className="ml-2 font-semibold tabular">{t.queue.photoCounter(index + 1, count)}</span>}
      </DialogDescription>
      <div className="mt-4 flex min-h-40 items-center justify-center overflow-hidden rounded-card border border-panel-line bg-panel-sunken">
        {state.status === 'ready' ? (
          <img src={state.url} alt={t.queue.photoAlt(age)} className="max-h-[70vh] w-full object-contain" />
        ) : state.status === 'error' ? (
          <p role="alert" className="flex items-center gap-2 p-6 text-base text-ink-muted">
            <ImageOff aria-hidden className="size-5" />
            {t.queue.photoFailed}
          </p>
        ) : (
          <p role="status" className="p-6 text-base text-ink-muted">
            {t.queue.photoLoading}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Photos citizens attached to this incident's reports: up to three thumbnails, "+N" for the rest,
 * and a dialog with the larger image. Operator-only: callers render it only when controls are unlocked.
 */
export function IncidentPhotos({ photos, nowS }: { photos: readonly IncidentPhoto[]; nowS: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const shown = photos.slice(0, MAX_THUMBS);
  const more = photos.length - shown.length;
  const current = open === null ? null : photos[Math.min(open, photos.length - 1)]!;
  const step = (d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length));
  return (
    <div role="group" aria-label={t.queue.photosLabel} className="mt-3 flex flex-wrap items-center gap-2">
      {shown.map((p, i) => (
        <Thumb key={p.reportId} photo={p} nowS={nowS} onOpen={() => setOpen(i)} />
      ))}
      {more > 0 && (
        <button
          type="button"
          className={cn(tile, 'vw-press text-meta font-semibold text-ink-on-shell tabular hover:border-shell-hairline-strong')}
          aria-label={t.queue.photoMoreLabel(more)}
          onClick={() => setOpen(MAX_THUMBS)}
        >
          {t.queue.photoMore(more)}
        </button>
      )}
      <Dialog open={open !== null} onOpenChange={(o) => (o ? undefined : setOpen(null))}>
        <DialogContent className="w-[min(92vw,calc(var(--spacing)*200))]">
          {current && (
            <>
              <Viewer photo={current} nowS={nowS} index={open!} count={photos.length} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-body text-ink-muted">
                  <Lock aria-hidden className="size-4 shrink-0" />
                  {t.queue.photoPrivacy}
                </p>
                {photos.length > 1 && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" aria-label={t.queue.photoPrev} onClick={() => step(-1)}>
                      <ChevronLeft aria-hidden className="size-5" />
                    </Button>
                    <Button variant="outline" size="icon" aria-label={t.queue.photoNext} onClick={() => step(1)}>
                      <ChevronRight aria-hidden className="size-5" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
