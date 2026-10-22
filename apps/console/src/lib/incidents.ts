import type { Incident, IncidentStatus } from '@vighnaway/contracts';
import { formatSimClock } from '@vighnaway/contracts';
import { isStale } from '@vighnaway/engine';
import { t } from '@/i18n';
import { activeScenario } from '@/stores/scenario';

export type QueueGroup = 'corroborated' | 'unverified' | 'verified' | 'closed';
export const QUEUE_GROUPS: readonly QueueGroup[] = ['corroborated', 'unverified', 'verified', 'closed'];

export const groupOf = (status: IncidentStatus): QueueGroup =>
  status === 'resolved' || status === 'dismissed' ? 'closed' : status;

/** Grouped by status, newest first (latest update), ties by id. */
export function groupIncidents(incidents: readonly Incident[]): Record<QueueGroup, Incident[]> {
  const out: Record<QueueGroup, Incident[]> = { corroborated: [], unverified: [], verified: [], closed: [] };
  for (const inc of incidents) out[groupOf(inc.status)].push(inc);
  for (const g of QUEUE_GROUPS) {
    out[g].sort((a, b) => b.updatedAtS - a.updatedAtS || b.lastReportAtS - a.lastReportAtS || (a.id < b.id ? -1 : 1));
  }
  return out;
}

export const incidentAgeS = (inc: Incident, nowS: number): number => Math.max(0, nowS - inc.lastReportAtS);

export interface IncidentFacts {
  title: string;
  status: string;
  source: string;
  age: string;
  stale: boolean;
  lastReportClock: string;
}

export function incidentFacts(inc: Incident, nowS: number, clockStartsAt: string = activeScenario().clockStartsAt): IncidentFacts {
  const ageS = incidentAgeS(inc, nowS);
  return {
    title: t.evidence.hazard(inc),
    status: t.evidence.status(inc),
    source: t.evidence.source(inc),
    age: t.time.age(ageS),
    stale: isStale(ageS),
    lastReportClock: formatSimClock(clockStartsAt, inc.lastReportAtS),
  };
}

export const isClosed = (inc: Incident): boolean => inc.status === 'resolved' || inc.status === 'dismissed';

/** Above this many incidents on the map (a live feed), markers switch to their compact form. */
export const DENSE_MARKERS = 20;

export type MarkerDensity = 'full' | 'compact';

/** Full markers for a handful of incidents; compact ones when a feed fills the map. */
export const markerDensity = (count: number): MarkerDensity => (count > DENSE_MARKERS ? 'compact' : 'full');
