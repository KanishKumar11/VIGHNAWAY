'use client';

import { useQuery } from '@tanstack/react-query';
import type { IncidentReporter } from '@vighnaway/contracts';
import { useMemo } from 'react';
import { ApiError, api } from '@/lib/api';
import { resolveCredential } from '@/lib/credential';
import { useOperator } from '@/stores/operator';
import { useScenarioStore } from '@/stores/scenario';
import { useSession } from '@/stores/session';

const POLL_MS = 20_000;
const stopsPolling = (e: unknown) => e instanceof ApiError && (e.code === 'UNAUTHORIZED' || e.code === 'FORBIDDEN');

/**
 * Who reported each incident (signed-in reporters only), by incident id. Operator-only: with the controls locked
 * it makes no request and returns an empty map, so no name shows. An API older than this feature simply gives none.
 */
export function useIncidentReporters(enabled = true): ReadonlyMap<string, readonly IncidentReporter[]> {
  const scenarioId = useScenarioStore((s) => s.id);
  const sessionToken = useSession((s) => s.token);
  const role = useSession((s) => s.user?.role ?? null);
  const legacy = useOperator((s) => s.token);
  const token = resolveCredential({ token: sessionToken, role }, legacy)?.token ?? null;
  const query = useQuery({
    queryKey: ['incident-reporters', scenarioId, token],
    queryFn: ({ signal }) => api.incidentReporters(scenarioId, token!, { signal }),
    enabled: enabled && !!token && !!scenarioId,
    refetchInterval: (q) => (stopsPolling(q.state.error) || q.state.error ? false : POLL_MS),
    retry: false,
  });
  const reporters = token && enabled ? query.data?.reporters : undefined;
  return useMemo(() => new Map(Object.entries(reporters ?? {})), [reporters]);
}
