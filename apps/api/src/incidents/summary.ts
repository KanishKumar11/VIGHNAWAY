import {
  type Incident,
  INCIDENT_TYPE_LABEL,
  type ReportOutcome,
  sourceLabel,
  statusLabel,
} from '@vighnaway/contracts';

export type ChangeKind = ReportOutcome | 'verified' | 'resolved' | 'dismissed' | 'feed_created' | 'feed_updated' | 'feed_cleared';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Flooding (knee deep)", "Heavy congestion", "Road closed", "Debris (high)". */
export function hazardWhat(i: Incident): string {
  switch (i.type) {
    case 'flood':
      return i.depth ? `Flooding (${i.depth} deep)` : 'Flooding (depth not given)';
    case 'congestion':
      return i.congestion ? `${cap(i.congestion)} congestion` : 'Congestion';
    case 'debris':
    case 'accident':
      return i.severity ? `${INCIDENT_TYPE_LABEL[i.type]} (${i.severity})` : INCIDENT_TYPE_LABEL[i.type];
    default:
      return INCIDENT_TYPE_LABEL[i.type];
  }
}

/**
 * Plain-language ticker line for incident.upserted and incident_events. Always names the
 * evidence status and source; never says "confirmed" or "safe".
 */
export function summarize(kind: ChangeKind, i: Incident, opts: { note?: string | null; clearDevices?: number; simulatedOperator?: boolean } = {}): string {
  const where = `${hazardWhat(i)} at ${i.roadName ?? 'an unnamed road'}`;
  const status = statusLabel(i);
  let line: string;
  switch (kind) {
    case 'created_incident':
      line = `${where} reported: ${status}`;
      break;
    case 'linked_new_incident':
      line = `${where} reported again after it was resolved: new incident, ${status}`;
      break;
    case 'attached':
      line = `${where}: another report (${i.reportCount} reports), ${status}`;
      break;
    case 'updated_duplicate':
      line = `${where}: the same device updated its report, ${status}`;
      break;
    case 'corroborated':
      line = `${where} marked ${status}`;
      break;
    case 'marked_conflicting':
      line = `Road clear report contradicts ${where}: marked Conflicting, still ${status}`;
      break;
    case 'resolved_by_clear_reports':
      line = `${where} marked Resolved: Road clear reports from ${opts.clearDevices ?? 2} devices`;
      break;
    case 'verified':
      line = `${where} marked ${status}`;
      break;
    case 'resolved':
    case 'dismissed':
      line = `${where} marked ${status} by operator${opts.simulatedOperator ? ' (simulated)' : ''}`;
      break;
    case 'off_map':
      line = `Report saved off-map near ${i.roadName ?? 'an unmapped road'}: no mapped road, no route change`;
      break;
    case 'clear_noted':
      line = `Road clear reported near ${i.roadName ?? 'an unnamed road'}`;
      break;
    case 'feed_created':
      line = `${where} reported by live traffic: ${status}`;
      break;
    case 'feed_updated':
      line = `${where} updated by live traffic: ${status}`;
      break;
    case 'feed_cleared':
      line = `${where} no longer in the live traffic feed: marked Resolved`;
      break;
  }
  line += ` · ${sourceLabel(i)}`;
  if (opts.note) line += ` · Note: "${opts.note}"`;
  return line;
}
