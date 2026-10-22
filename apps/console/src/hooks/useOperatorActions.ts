'use client';

import { useMutation } from '@tanstack/react-query';
import type { ClosureRequest, Incident, OperatorAction, SimAction } from '@vighnaway/contracts';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { dropCredential, getOperatorCredential, type Credential } from '@/lib/credential';
import { useScenarioStore } from '@/stores/scenario';
import { isReplaying } from '@/stores/replay';
import { useLiveStore } from '@/stores/live';
import { useOperator } from '@/stores/operator';
import { useSession } from '@/stores/session';
import { toast } from '@/components/ui/toast';

const TARGET: Record<OperatorAction, Incident['status']> = { verify: 'verified', resolve: 'resolved', dismiss: 'dismissed' };

export const errorMessage = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

/** A rejected credential is forgotten; a rejected demo token reopens the Demo access dialog. */
function handleAuth(e: unknown, used: Credential) {
  if (!(e instanceof ApiError)) return;
  if (e.code === 'UNAUTHORIZED') {
    dropCredential(used);
    if (used.kind === 'token') useOperator.getState().openDialog();
  } else if (e.code === 'FORBIDDEN' && used.kind === 'session') {
    // The account's role may have changed since sign-in: read it again.
    void useSession.getState().revalidate();
  }
}

/** Runs one operator request with the resolved credential (a staff session first, else the demo token). */
async function withCredential<T>(run: (token: string) => Promise<T>): Promise<T> {
  const credential = getOperatorCredential();
  if (!credential) throw new ApiError('UNAUTHORIZED', t.operator.rejected, 401);
  try {
    return await run(credential.token);
  } catch (e) {
    handleAuth(e, credential);
    throw e;
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
      return withCredential((token) => api.incidentAction(useScenarioStore.getState().id, incident.id, action, token));
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
      return withCredential((token) => api.simAction(useScenarioStore.getState().id, action, token));
    },
    onSuccess: (resp) => useLiveStore.getState().setSim(resp.sim),
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
}

/** Clear audience reports: dismisses every open incident that only demo-audience reports support. */
export function useClearAudience() {
  return useMutation({
    mutationFn: async () => {
      if (isReplaying()) throw new ApiError('CONFLICT', t.replay.readOnly, 409);
      return withCredential((token) => api.clearAudience(useScenarioStore.getState().id, token));
    },
    onSuccess: (resp) => toast.success(t.audience.cleared(resp.cleared)),
    onError: (e) => {
      toast.error(t.audience.clearFailed(errorMessage(e)));
    },
  });
}

/** Close a road (P2-6): a preview (confirm false) creates nothing; confirm creates one Verified closure. */
export function useCloseRoad() {
  return useMutation({
    mutationFn: async (body: ClosureRequest) => {
      if (isReplaying()) throw new ApiError('CONFLICT', t.replay.readOnly, 409);
      return withCredential((token) => api.closeRoad(useScenarioStore.getState().id, body, token));
    },
    onSuccess: (resp) => {
      if (resp.incident) toast.success(t.closeRoad.done(resp.preview.roadNames[0] ?? t.closeRoad.unnamed));
    },
  });
}
