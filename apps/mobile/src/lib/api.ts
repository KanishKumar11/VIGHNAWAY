import {
  API_PATHS,
  ApiErrorSchema,
  AuthSessionResponseSchema,
  FeedStatusSchema,
  HealthResponseSchema,
  HospitalStatesResponseSchema,
  IncidentsResponseSchema,
  MeResponseSchema,
  MyStatsResponseSchema,
  OtpRequestResponseSchema,
  ReportPhotoResponseSchema,
  ReportResponseSchema,
  ScenarioListResponseSchema,
  ScenarioResponseSchema,
  type AuthSessionResponse,
  type FeedStatus,
  type HealthResponse,
  type HospitalStatesResponse,
  type IncidentsResponse,
  type MeResponse,
  type MyStatsResponse,
  type OtpRequestBody,
  type OtpRequestResponse,
  type OtpVerifyBody,
  type ReportInput,
  type ReportPhotoInput,
  type ReportPhotoResponse,
  type ReportResponse,
  type ScenarioListResponse,
  type ScenarioResponse,
} from '@vighnaway/contracts';

/** status 0 = network failure or timeout (treated as offline for reports). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    /** error.details from the API envelope, when it sent any (a 429 carries retryAfterS). */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const TIMEOUT_MS = 8000;
const REPORT_TIMEOUT_MS = 20000;
/** A photo is up to a few hundred kB: allow a slow link time to finish it. */
const PHOTO_TIMEOUT_MS = 45000;

/** The part of a Zod schema we use (zod is a dependency of contracts, not of this app). */
interface Parser<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

async function request<T>(
  baseUrl: string,
  path: string,
  schema: Parser<T>,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number; token?: string | null } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : null),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : null),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiRequestError(e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Network request failed', 0, null);
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(json);
    throw new ApiRequestError(err.success ? err.data.error.message : `HTTP ${res.status}`, res.status, err.success ? err.data.error.code : null, err.success ? err.data.error.details : undefined);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiRequestError('Unexpected response from the server', res.status, 'INVALID_RESPONSE');
  return parsed.data;
}

/** Accepts any body, including none (204 responses have no JSON). */
const anyBody: Parser<unknown> = { safeParse: (v) => ({ success: true, data: v }) };

/** Seconds to wait before asking again, from a 429's details; null when the server gave none. */
export function retryAfterSeconds(e: unknown): number | null {
  if (!(e instanceof ApiRequestError)) return null;
  const d = e.details;
  if (typeof d !== 'object' || d === null) return null;
  const v = (d as { retryAfterS?: unknown }).retryAfterS;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : null;
}

export const api = {
  health: (baseUrl: string): Promise<HealthResponse> =>
    request(baseUrl, API_PATHS.health, HealthResponseSchema, { timeoutMs: 5000 }),
  scenarios: (baseUrl: string): Promise<ScenarioListResponse> =>
    request(baseUrl, API_PATHS.scenarios, ScenarioListResponseSchema, { timeoutMs: 5000 }),
  /** Hospital states set by the control room (P2-4); public. */
  hospitals: (baseUrl: string, id: string): Promise<HospitalStatesResponse> =>
    request(baseUrl, API_PATHS.hospitals(id), HospitalStatesResponseSchema, { timeoutMs: 5000 }),
  feed: (baseUrl: string, id: string): Promise<FeedStatus> => request(baseUrl, API_PATHS.feed(id), FeedStatusSchema, { timeoutMs: 5000 }),
  scenario: (baseUrl: string, id: string): Promise<ScenarioResponse> =>
    request(baseUrl, API_PATHS.scenario(id), ScenarioResponseSchema),
  incidents: (baseUrl: string, id: string, sinceSeq?: number): Promise<IncidentsResponse> =>
    request(
      baseUrl,
      `${API_PATHS.incidents(id)}${sinceSeq === undefined ? '' : `?sinceSeq=${sinceSeq}`}`,
      IncidentsResponseSchema,
    ),
  /**
   * Signing in is optional: with a token the report is linked to the account, without one it is
   * anonymous. The server ignores a bad token, but if anything answers 401 to an authorised report
   * it is sent again anonymously, so a stale session can never stop a report.
   */
  report: async (baseUrl: string, id: string, input: ReportInput, token?: string | null): Promise<ReportResponse> => {
    // A report is tiny but the phone may be on a very slow link: wait longer than a read before queueing it.
    const sendBody = (body: ReportInput, tk?: string | null) => request(baseUrl, API_PATHS.reports(id), ReportResponseSchema, { method: 'POST', body, token: tk, timeoutMs: REPORT_TIMEOUT_MS });
    const sendAuthed = async (body: ReportInput) => {
      if (!token) return sendBody(body);
      try {
        return await sendBody(body, token);
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) return sendBody(body);
        throw e;
      }
    };
    try {
      return await sendAuthed(input);
    } catch (e) {
      // A server from before offline relay (strict body) or a claimed observed time it will not take: the id and
      // the claim are labels only, so send the report without them rather than lose it.
      if (e instanceof ApiRequestError && e.status === 400 && (input.clientReportId !== undefined || input.observedAtS !== undefined)) {
        const { clientReportId: _id, observedAtS: _at, ...bare } = input;
        return sendAuthed(bare);
      }
      throw e;
    }
  },
  /** A photo of the place, sent after the report so a server without photos still takes the report. */
  reportPhoto: (baseUrl: string, id: string, reportId: string, input: ReportPhotoInput): Promise<ReportPhotoResponse> =>
    request(baseUrl, API_PATHS.reportPhoto(id, reportId), ReportPhotoResponseSchema, { method: 'POST', body: input, timeoutMs: PHOTO_TIMEOUT_MS }),
  authOtpRequest: (baseUrl: string, body: OtpRequestBody): Promise<OtpRequestResponse> =>
    request(baseUrl, API_PATHS.authOtpRequest, OtpRequestResponseSchema, { method: 'POST', body }),
  authOtpVerify: (baseUrl: string, body: OtpVerifyBody): Promise<AuthSessionResponse> =>
    request(baseUrl, API_PATHS.authOtpVerify, AuthSessionResponseSchema, { method: 'POST', body }),
  authMe: (baseUrl: string, token: string): Promise<MeResponse> =>
    request(baseUrl, API_PATHS.authMe, MeResponseSchema, { token, timeoutMs: 6000 }),
  authLogout: async (baseUrl: string, token: string): Promise<void> => {
    await request(baseUrl, API_PATHS.authLogout, anyBody, { method: 'POST', token, timeoutMs: 5000 });
  },
  myStats: (baseUrl: string, token: string): Promise<MyStatsResponse> =>
    request(baseUrl, API_PATHS.myStats, MyStatsResponseSchema, { token, timeoutMs: 6000 }),
};
