'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { resolveCredential } from '@/lib/credential';
import { useOperator } from '@/stores/operator';
import { useScenarioStore } from '@/stores/scenario';
import { useSession } from '@/stores/session';

const POLL_MS = 20_000;

/** One entry of the operator photo list: a photo that belongs to a report, and so to an incident. */
export interface IncidentPhoto {
  reportId: string;
  incidentId: string;
  /** Server simulation seconds of the report. */
  atS: number;
  sizeBytes: number;
}

/** The credential the operator actions would send (a staff session first, else the demo token), or null when locked. */
function useOperatorBearer(): string | null {
  const sessionToken = useSession((s) => s.token);
  const role = useSession((s) => s.user?.role ?? null);
  const legacy = useOperator((s) => s.token);
  return resolveCredential({ token: sessionToken, role }, legacy)?.token ?? null;
}

const stopsPolling = (e: unknown) => e instanceof ApiError && (e.code === 'UNAUTHORIZED' || e.code === 'FORBIDDEN');

/**
 * Photos that citizens attached to reports, grouped by incident (newest first). Operator-only: with
 * the controls locked it makes no request and returns an empty map, so nothing about photos shows.
 */
export function useIncidentPhotos(enabled = true): ReadonlyMap<string, readonly IncidentPhoto[]> {
  const scenarioId = useScenarioStore((s) => s.id);
  const token = useOperatorBearer();
  const query = useQuery({
    // The token is part of the key so a new credential refetches; it stays in memory only.
    queryKey: ['photos', scenarioId, token],
    queryFn: ({ signal }) => api.photos(scenarioId, token!, { signal }),
    enabled: enabled && !!token && !!scenarioId,
    refetchInterval: (q) => (stopsPolling(q.state.error) ? false : POLL_MS),
    retry: false,
  });
  const photos = token && enabled ? query.data?.photos : undefined;
  return useMemo(() => {
    const byIncident = new Map<string, IncidentPhoto[]>();
    for (const p of photos ?? []) {
      if (p.incidentId === null) continue;
      const list = byIncident.get(p.incidentId) ?? [];
      list.push({ reportId: p.reportId, incidentId: p.incidentId, atS: p.atS, sizeBytes: p.sizeBytes });
      byIncident.set(p.incidentId, list);
    }
    return byIncident;
  }, [photos]);
}

export type PhotoUrl = { status: 'loading' } | { status: 'error' } | { status: 'ready'; url: string };

/**
 * One photo as an object URL. An <img src> cannot send the Authorization header, so the bytes are
 * fetched with it, kept as a Blob, and revoked when the image is replaced or unmounted.
 * The photo never changes once uploaded, so it is fetched once per report (staleTime Infinity).
 */
export function usePhotoUrl(reportId: string | null): PhotoUrl {
  const scenarioId = useScenarioStore((s) => s.id);
  const token = useOperatorBearer();
  const query = useQuery({
    queryKey: ['photo', scenarioId, reportId, token],
    queryFn: ({ signal }) => api.photoBlob(scenarioId, reportId!, token!, { signal }),
    enabled: !!reportId && !!token,
    staleTime: Infinity,
    retry: false,
  });
  const blob = query.data;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);
  if (query.isError) return { status: 'error' };
  return url && blob ? { status: 'ready', url } : { status: 'loading' };
}
