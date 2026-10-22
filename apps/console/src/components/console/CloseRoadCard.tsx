'use client';

import type { ClosureResponse, LatLng } from '@vighnaway/contracts';
import { CLOSURE_MAX_POINTS } from '@vighnaway/contracts';
import { colors, routeStyles, zIndex } from '@vighnaway/tokens';
import { Ban, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MapPanel } from '@/components/map/MapPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { tripEnv } from '@/hooks/useDemoTrip';
import { errorMessage, useCloseRoad } from '@/hooks/useOperatorActions';
import { t } from '@/i18n';
import { useOperatorAccess } from '@/lib/credential';
import { buildScene, type SceneLine } from '@/lib/scene';
import { GRAPH_FILE } from '@/lib/scenario';
import { useScenarioStore } from '@/stores/scenario';

const line = (key: string, coords: [number, number][], width: number, dash: readonly number[] | null): SceneLine => ({
  key,
  kind: 'blocked',
  coords,
  color: colors.danger,
  width,
  casing: null,
  casingWidth: 0,
  opacity: 1,
  dash,
  z: zIndex.blocked,
  fade: false,
});

/**
 * Operator tool (P2-6): "Close a road". Tap along the road on the map; the console asks the server which road
 * segments the line follows (a preview, nothing created), and a second step confirms one Verified closure with
 * the source "Control room". The route engine then treats it like any other Verified closure.
 */
export function CloseRoadCard() {
  const access = useOperatorAccess();
  const scenarioId = useScenarioStore((s) => s.id);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [preview, setPreview] = useState<ClosureResponse['preview'] | null>(null);
  const [note, setNote] = useState('');
  const mutation = useCloseRoad();

  const scene = useMemo(() => {
    const base = buildScene(tripEnv(scenarioId), GRAPH_FILE, null, { phase: 'idle', flashOn: false, change: null });
    const extra: SceneLine[] = [];
    if (preview) {
      const byId = new Map(GRAPH_FILE.edges.map((e) => [e.id, e] as const));
      for (const id of preview.edgeIds) {
        const e = byId.get(id);
        if (e) extra.push(line(`cl-m-${id}`, e.geometry, routeStyles.blocked.width + 2, null));
      }
    }
    if (points.length >= 2) extra.push(line('cl-draw', points.map((p) => [p.lng, p.lat] as [number, number]), routeStyles.blocked.width, routeStyles.blocked.dash));
    return { ...base, origin: null, destination: null, otherPlaces: [], lines: [...base.lines, ...extra] };
  }, [scenarioId, points, preview]);

  if (!access) return null;

  const reset = () => {
    setPoints([]);
    setPreview(null);
    setNote('');
    mutation.reset();
  };
  const body = { polyline: points, confirm: false, ...(note.trim() ? { note: note.trim() } : {}) };

  return (
    <>
      <div className="min-w-0 flex-1">
        <Button variant="outline" onClick={() => setOpen(true)} className="h-auto min-h-16 w-full flex-col gap-1 px-1 py-2 text-center text-meta leading-tight" aria-label={t.closeRoad.open} title={t.closeRoad.open} data-testid="close-road-open">
          <Ban aria-hidden className="size-5" />
          {t.closeRoad.openShort}
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="w-[min(94vw,calc(var(--spacing)*190))]">
          <DialogTitle>{t.closeRoad.title}</DialogTitle>
          <DialogDescription>{t.closeRoad.intro}</DialogDescription>
          <div className="relative mt-4 h-80 overflow-hidden rounded-card border border-control-border">
            <MapPanel
              scene={scene}
              compact
              pick={points[points.length - 1] ?? null}
              onPick={(p) => {
                if (points.length >= CLOSURE_MAX_POINTS) return;
                setPreview(null);
                setPoints((cur) => [...cur, p]);
              }}
            />
          </div>
          <p className="mt-2 text-meta text-ink-muted" aria-live="polite">
            {points.length < 2 ? t.closeRoad.tapMore(points.length) : t.closeRoad.points(points.length)}
          </p>
          {preview && (
            <div role="status" className="mt-2 rounded-card border border-warn bg-warn-surface px-4 py-3 text-body text-warn-ink" data-testid="close-road-preview">
              <p className="font-semibold">{t.closeRoad.matched(preview.roadNames.length ? preview.roadNames.slice(0, 3).join(', ') : t.closeRoad.unnamed, preview.lengthM)}</p>
              <p className="mt-1">{t.closeRoad.consequence}</p>
            </div>
          )}
          {mutation.error && (
            <p role="alert" className="mt-2 text-body font-semibold text-danger-ink">
              {errorMessage(mutation.error)}
            </p>
          )}
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-meta font-medium text-ink-muted">{t.closeRoad.noteLabel}</span>
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              className="h-11 rounded-button border border-control-border bg-panel-raised px-3 text-body text-ink"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" disabled={points.length === 0} onClick={() => (setPoints((p) => p.slice(0, -1)), setPreview(null))}>
              <Undo2 aria-hidden className="size-5" />
              {t.closeRoad.undo}
            </Button>
            {!preview ? (
              <Button
                disabled={points.length < 2 || mutation.isPending}
                onClick={() => mutation.mutate(body, { onSuccess: (r) => setPreview(r.preview) })}
                data-testid="close-road-preview-btn"
              >
                {t.closeRoad.preview}
              </Button>
            ) : (
              <Button
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate(
                    { ...body, confirm: true },
                    {
                      onSuccess: () => {
                        setOpen(false);
                        reset();
                      },
                    },
                  )
                }
                data-testid="close-road-confirm"
              >
                {t.closeRoad.confirm}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
