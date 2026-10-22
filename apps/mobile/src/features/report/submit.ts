import { REPORT_TYPE_LABEL, type ReportInput } from '@vighnaway/contracts';
import { t } from '@/i18n/en';
import { api, ApiRequestError } from '@/lib/api';
import { useActivity } from '@/stores/activity';
import { authToken } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { usePendingReports } from '@/stores/reports';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';

export type SubmitOutcome = { kind: 'sent' } | { kind: 'pending' } | { kind: 'error'; message: string };

function queue(input: ReportInput): SubmitOutcome {
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
  });
  return { kind: 'pending' };
}

/** POST the report; queue it as Pending send when offline or the network fails. */
export async function submitReport(input: ReportInput): Promise<SubmitOutcome> {
  if (useConnection.getState().net === 'offline') return queue(input);
  try {
    // Signed in: the report is linked to the account. Signed out (or a stale session): anonymous, as before.
    await api.report(useSettings.getState().apiUrl, useScenario.getState().scenario.id, input, authToken());
    useActivity.getState().add({
      atS: useSim.getState().simTimeS,
      kind: 'report_sent',
      text: t('activityReportSent', { type: REPORT_TYPE_LABEL[input.type] }),
    });
    return { kind: 'sent' };
  } catch (e) {
    if (e instanceof ApiRequestError) {
      if (e.status === 0) return queue(input);
      if (e.status === 422 || e.code === 'NOT_ON_ROAD') return { kind: 'error', message: t('errNotOnRoad') };
      if (e.status === 429 || e.code === 'RATE_LIMITED') return { kind: 'error', message: t('errRateLimited') };
      if (e.status === 409) return { kind: 'error', message: t('errAlreadyAnswered') };
      return { kind: 'error', message: t('errGeneric', { message: e.message }) };
    }
    return queue(input);
  }
}
