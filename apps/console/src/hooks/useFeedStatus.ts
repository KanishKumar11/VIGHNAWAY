'use client';

import { useQuery } from '@tanstack/react-query';
import type { FeedStatus } from '@vighnaway/contracts';
import { FEED_PROVIDER_LABEL, formatAge } from '@vighnaway/contracts';
import { t } from '@/i18n';
import { api } from '@/lib/api';

const POLL_MS = 30_000;

/** Live traffic feed status for a live scenario (polled; missing endpoint reads as unknown). */
export function useFeedStatus(scenarioId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['feed', scenarioId],
    queryFn: ({ signal }) => api.feed(scenarioId, { signal }),
    enabled,
    refetchInterval: POLL_MS,
    retry: false,
  });
}

export type FeedTone = 'ok' | 'waiting' | 'error' | 'off' | 'unknown';

/** One line for the feed chip, with a tone for its dot. Pure, so it is unit tested. */
export function feedLine(status: FeedStatus | null | undefined, nowS: number): { tone: FeedTone; text: string } {
  if (!status) return { tone: 'unknown', text: t.feed.unknown };
  const provider = FEED_PROVIDER_LABEL[status.provider];
  if (!status.enabled) {
    const noKey = !status.reason || /key/i.test(status.reason);
    return { tone: 'off', text: noKey ? t.feed.off : t.feed.offReason(status.reason!) };
  }
  if (status.lastError && (status.lastSuccessAtS === null || (status.lastPollAtS ?? 0) > status.lastSuccessAtS)) {
    return { tone: 'error', text: t.feed.failed(provider, status.lastError) };
  }
  if (status.lastSuccessAtS === null) return { tone: 'waiting', text: t.feed.waiting(provider) };
  return { tone: 'ok', text: t.feed.updated(provider, formatAge(nowS - status.lastSuccessAtS)) };
}
