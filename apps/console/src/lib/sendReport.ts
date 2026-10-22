import type { ReportInput, ReportResponse } from '@vighnaway/contracts';
import { api, ApiError } from '@/lib/api';
import { activeSession, useSession } from '@/stores/session';

/**
 * Sends a report. When someone is signed in the session goes along as Authorization: Bearer, so
 * the report is linked to the account; otherwise it is anonymous, exactly as before. A stale
 * token never blocks a report: on a 401 the session is dropped and the report is sent again
 * without it. Signing in is never required.
 */
export async function sendReport(scenarioId: string, input: ReportInput): Promise<ReportResponse> {
  const session = activeSession();
  if (!session) return api.report(scenarioId, input);
  try {
    const resp = await api.report(scenarioId, input, { token: session.token });
    useSession.getState().bumpStats();
    return resp;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
      useSession.getState().clear();
      return api.report(scenarioId, input);
    }
    throw e;
  }
}
