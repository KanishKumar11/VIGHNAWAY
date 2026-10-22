import { REPORT_TYPE_LABEL, type ReportInput } from '@vighnaway/contracts';
import { t } from '@/i18n/en';
import { api, ApiRequestError } from '@/lib/api';
import { useActivity } from '@/stores/activity';
import { authToken } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { stampReport } from '@/lib/relay';
import { usePendingReports } from '@/stores/reports';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';

/** What happened to the photo: none was attached, it was uploaded, or the report went through without it. */
export type PhotoStatus = 'none' | 'sent' | 'failed';
/** offMap: the API saved it but there is no mapped road there, so it changes no route (live mode). */
export type SubmitOutcome = { kind: 'sent'; photo: PhotoStatus; offMap?: boolean } | { kind: 'pending' } | { kind: 'error'; message: string };

export interface ReportPhoto {
  /** The JPEG as base64 (no data: prefix). */
  data: string;
}

/**
 * Uploads the photo of an accepted report. It is its own request, sent after the report, so a
 * server that does not know photos (or a slow link) never costs the report itself.
 */
export async function sendPhoto(scenarioId: string, reportId: string, deviceId: string, photo: ReportPhoto): Promise<'sent' | 'failed'> {
  try {
    await api.reportPhoto(useSettings.getState().apiUrl, scenarioId, reportId, { deviceId, contentType: 'image/jpeg', data: photo.data });
    return 'sent';
  } catch {
    return 'failed';
  }
}

function queue(input: ReportInput, photo?: ReportPhoto | null): SubmitOutcome {
  const activityId = `pending-${Date.now().toString(36)}`;
  useActivity.getState().add({
    atS: useSim.getState().simTimeS,
    kind: 'pending_report',
    text: t('activityPendingSend', { type: REPORT_TYPE_LABEL[input.type] }),
  });
  const entry = useActivity.getState().entries[0];
  usePendingReports.getState().enqueue({
    localId: activityId,
    scenarioId: useScenario.getState().scenario.id,
    input,
    createdAtWallMs: Date.now(),
    activityId: entry?.id ?? null,
    photo: photo ?? null,
  });
  return { kind: 'pending' };
}

/** POST the report; queue it as Pending send when offline or the network fails. */
export async function submitReport(raw: ReportInput, photo?: ReportPhoto | null): Promise<SubmitOutcome> {
  // Its own id and observed time travel with it, through a retry or a QR relay (P2-2).
  const input = stampReport(raw);
  if (useConnection.getState().net === 'offline') return queue(input, photo);
  const scenarioId = useScenario.getState().scenario.id;
  try {
    // Signed in: the report is linked to the account. Signed out (or a stale session): anonymous, as before.
    const res = await api.report(useSettings.getState().apiUrl, scenarioId, input, authToken());
    useActivity.getState().add({
      atS: useSim.getState().simTimeS,
      kind: 'report_sent',
      text: t('activityReportSent', { type: REPORT_TYPE_LABEL[input.type] }),
    });
    return {
      kind: 'sent',
      photo: photo ? await sendPhoto(scenarioId, res.receipt.reportId, input.deviceId, photo) : 'none',
      offMap: res.receipt.outcome === 'off_map',
    };
  } catch (e) {
    if (e instanceof ApiRequestError) {
      if (e.status === 0) return queue(input, photo);
      if (e.status === 422 || e.code === 'NOT_ON_ROAD') return { kind: 'error', message: t('errNotOnRoad') };
      if (e.status === 429 || e.code === 'RATE_LIMITED') return { kind: 'error', message: t('errRateLimited') };
      if (e.status === 409) return { kind: 'error', message: t('errAlreadyAnswered') };
      return { kind: 'error', message: t('errGeneric', { message: e.message }) };
    }
    return queue(input, photo);
  }
}
