'use client';

import type { HospitalStateValue } from '@vighnaway/contracts';
import type { HospitalAssignment } from '@vighnaway/engine';
import { Hospital } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { tripEnv } from '@/hooks/useDemoTrip';
import { errorMessage, useHospitals, useSetHospital } from '@/hooks/useOperatorActions';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useOperatorAccess } from '@/lib/credential';
import { assignCallers, SIMULATED_CALLERS, statesOf } from '@/lib/hospitals';
import { displayIncidents, useLiveStore } from '@/stores/live';
import { useScenarioStore } from '@/stores/scenario';

const STATES: readonly HospitalStateValue[] = ['accepting', 'busy', 'diverting'];

/** The reason line under one assigned caller; the engine's `passedOver` says which hospital was skipped and why. */
export function assignmentReason(a: HospitalAssignment, nameOf: (placeId: string) => string): string {
  if (a.reason !== 'spread' || !a.passedOver) return t.hospitals.reasonNearest;
  const name = nameOf(a.passedOver.placeId);
  return a.passedOver.state === 'accepting'
    ? t.hospitals.passedLoad(name, a.passedOver.alreadyAssigned)
    : t.hospitals.passedState(name, t.hospitals.states[a.passedOver.state]);
}

/**
 * Hospital load (P2-4.c). An operator marks each hospital Accepting, Busy or Diverting; the console re-plans a
 * batch of simulated callers with the same deterministic engine and shows where each goes and why. The state only
 * ranks hospitals: it never closes a road, and it is labelled as set by the control room (simulated).
 */
export function HospitalLoadCard() {
  const access = useOperatorAccess();
  const [open, setOpen] = useState(false);
  const hospitals = useHospitals();
  const setHospital = useSetHospital();
  const scenarioId = useScenarioStore((s) => s.id);
  const sync = useLiveStore((s) => s.sync);
  const optimistic = useLiveStore((s) => s.optimistic);
  const confirmed = useLiveStore((s) => s.confirmed);
  const nowS = useLiveStore((s) => s.simTimeS);

  const states = useMemo(() => statesOf(hospitals.data), [hospitals.data]);
  const names = useMemo(() => new Map((hospitals.data?.hospitals ?? []).map((h) => [h.placeId, h.name] as const)), [hospitals.data]);
  const assignments = useMemo(
    () => (open && hospitals.data ? assignCallers(tripEnv(scenarioId), displayIncidents({ sync, optimistic, confirmed }), nowS, states) : []),
    [open, hospitals.data, scenarioId, sync, optimistic, confirmed, nowS, states],
  );
  const nameOf = (id: string) => names.get(id) ?? id;

  return (
    <>
      <div className="border-t border-shell-hairline px-4 py-3">
        <Button variant="outline" onClick={() => setOpen(true)} className="w-full justify-start" data-testid="hospital-load-open">
          <Hospital aria-hidden className="size-5" />
          {t.hospitals.open}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,calc(var(--spacing)*150))]">
          <DialogTitle>{t.hospitals.title}</DialogTitle>
          <DialogDescription>{t.hospitals.intro(SIMULATED_CALLERS)}</DialogDescription>

          {hospitals.isPending && <p className="mt-4 text-body text-ink-muted">{t.hospitals.loading}</p>}
          {hospitals.error && (
            <p role="alert" className="mt-4 text-body font-semibold text-danger-ink">
              {t.hospitals.failed(errorMessage(hospitals.error))}
            </p>
          )}

          {hospitals.data && (
            <ul className="mt-4 flex flex-col gap-3" data-testid="hospital-states">
              {hospitals.data.hospitals.map((h) => (
                <li key={h.placeId} className="rounded-card border border-panel-line bg-panel-raised px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body font-semibold text-ink">{h.name}</span>
                    <span className="text-meta text-ink-muted">{h.setBy ? t.hospitals.setBy : t.hospitals.notSet}</span>
                  </div>
                  <div role="group" aria-label={t.hospitals.stateLabel(h.name)} className="mt-2 flex flex-wrap gap-2">
                    {STATES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={h.state === s ? 'ink' : 'outline'}
                        aria-pressed={h.state === s}
                        disabled={!access || setHospital.isPending}
                        onClick={() => setHospital.mutate({ placeId: h.placeId, state: s })}
                        className={cn(!access && 'cursor-not-allowed')}
                        data-testid={`hospital-${h.placeId}-${s}`}
                      >
                        {t.hospitals.states[s]}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!access && <p className="mt-2 text-meta text-ink-muted">{t.hospitals.operatorOnly}</p>}
          {setHospital.error && (
            <p role="alert" className="mt-2 text-body font-semibold text-danger-ink">
              {errorMessage(setHospital.error)}
            </p>
          )}

          {hospitals.data && (
            <section aria-labelledby="hospital-assign-title" className="mt-5">
              <h3 id="hospital-assign-title" className="text-title font-semibold text-ink">
                {t.hospitals.assignmentsTitle}
              </h3>
              <ol className="mt-2 flex flex-col gap-2" data-testid="hospital-assignments">
                {assignments.map((a, i) => (
                  <li key={a.tripId} className="rounded-card border border-panel-line px-4 py-2" data-testid={`hospital-assignment-${i + 1}`}>
                    <p className="text-body font-semibold text-ink">
                      {t.hospitals.caller(i + 1)}
                      {': '}
                      {a.placeId && a.etaS !== null ? t.hospitals.to(nameOf(a.placeId), Math.max(1, Math.round(a.etaS / 60))) : t.hospitals.none}
                    </p>
                    {a.placeId && <p className="text-meta text-ink-muted">{assignmentReason(a, nameOf)}</p>}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-meta text-ink-muted">{t.hospitals.footnote}</p>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
