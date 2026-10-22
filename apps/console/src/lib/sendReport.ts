import type { ReportInput, ReportResponse } from '@vighnaway/contracts';
import { api, ApiError } from '@/lib/api';
import { activeSession, useSession } from '@/stores/session';

/** True when the server refused the request because it does not know the `origin` field (an older API). */
export function rejectsOrigin(e: unknown, input: ReportInput): boolean {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED' || input.origin === undefined) return false;
  return Array.isArray(e.details) && e.details.some((d) => JSON.stringify(d).toLowerCase().includes('origin'));
}

async function post(scenarioId: string, input: ReportInput): Promise<ReportResponse> {
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

/**
 * Sends a report. When someone is signed in the session goes along as Authorization: Bearer, so
 * the report is linked to the account; otherwise it is anonymous, exactly as before. A stale
 * token never blocks a report: on a 401 the session is dropped and the report is sent again
 * without it. Signing in is never required.
 *
 * An API older than this app rejects the `origin` label ("web" or "audience") as an unknown field,
 * which would stop every web report. The label only tells where a report came from (it is never
 * evidence), so in that one case the report is sent again without it.
 */
export async function sendReport(scenarioId: string, input: ReportInput): Promise<ReportResponse> {
  try {
    return await post(scenarioId, input);
  } catch (e) {
    if (!rejectsOrigin(e, input)) throw e;
    const withoutOrigin: ReportInput = { ...input };
    delete withoutOrigin.origin;
    return post(scenarioId, withoutOrigin);
  }
}
