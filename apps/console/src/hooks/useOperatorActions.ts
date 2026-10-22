'use client';

import { useMutation } from '@tanstack/react-query';
import type { Incident, OperatorAction, SimAction } from '@vighnaway/contracts';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useScenarioStore } from '@/stores/scenario';
import { isReplaying } from '@/stores/replay';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { toast } from '@/components/ui/toast';

const TARGET: Record<OperatorAction, Incident['status']> = { verify: 'verified', resolve: 'resolved', dismiss: 'dismissed' };

export const errorMessage = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

function handleAuth(e: unknown) {
  if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
    useOperator.getState().setToken(null);
    useOperator.getState().openDialog();
  }
}

/** The optimistic version shown while the request runs. Never fed to the engine. */
export function optimisticIncident(incident: Incident, action: OperatorAction, nowS: number): Incident {
  const status = TARGET[action];
  return {
    ...incident,
    status,
    verifiedAtS: action === 'verify' ? nowS : incident.verifiedAtS,
    verifiedBy: action === 'verify' ? 'operator' : incident.verifiedBy,
    closedAtS: action === 'verify' ? null : nowS,
    updatedAtS: Math.max(incident.updatedAtS, nowS),
  };
}

/** Verify, Resolve, Dismiss: optimistic update, rollback and toast on error. */
export function useIncidentAction() {
  return useMutation({
    mutationFn: async ({ incident, action }: { incident: Incident; action: OperatorAction }) => {
      // Replay is read-only: a past moment never sends operator actions.
      if (isReplaying()) throw new ApiError('CONFLICT', t.replay.readOnly, 409);
      const token = useOperator.getState().token;
      if (!token) throw new ApiError('UNAUTHORIZED', t.operator.rejected, 401);
      return api.incidentAction(useScenarioStore.getState().id, incident.id, action, token);
    },
    onMutate: ({ incident, action }) => {
      if (isReplaying()) return;
      const live = useLiveStore.getState();
      live.setOptimistic(optimisticIncident(incident, action, live.simTimeS));
      if (action === 'verify') live.pulse(incident.id);
    },
    onError: (e, { incident, action }) => {
      useLiveStore.getState().rollback(incident.id);
      toast.error(t.queue.actionFailed(t.queue.actionVerb[action], errorMessage(e)));
      handleAuth(e);
    },
    onSuccess: (resp) => {
      useLiveStore.getState().confirm(resp.incident);
    },
  });
}

/** Play, Pause, Step, Reset. */
export function useSimAction() {
  return useMutation({
    mutationFn: async (action: SimAction) => {
      if (isReplaying()) throw new ApiError('CONFLICT', t.replay.readOnly, 409);
      const token = useOperator.getState().token;
      if (!token) throw new ApiError('UNAUTHORIZED', t.operator.rejected, 401);
      return api.simAction(useScenarioStore.getState().id, action, token);
    },
    onSuccess: (resp) => useLiveStore.getState().setSim(resp.sim),
    onError: (e) => {
      toast.error(errorMessage(e));
      handleAuth(e);
    },
  });
}
