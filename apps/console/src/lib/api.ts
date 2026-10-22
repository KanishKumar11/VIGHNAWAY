import {
  API_PATHS,
  AdminUserResponseSchema,
  AdminUsersResponseSchema,
  ApiErrorSchema,
  AuthSessionResponseSchema,
  MeResponseSchema,
  MyStatsResponseSchema,
  OtpRequestResponseSchema,
  PhotoListResponseSchema,
  ClearAudienceResponseSchema,
  ClosureResponseSchema,
  HealthResponseSchema,
  IncidentsResponseSchema,
  OperatorActionResponseSchema,
  ReportResponseSchema,
  FeedStatusSchema,
  HistoryResponseSchema,
  HospitalStatesResponseSchema,
  ScenarioListResponseSchema,
  ScenarioResponseSchema,
  SimResponseSchema,
  type AdminCreateUserBody,
  type AdminUpdateUserBody,
  type AdminUserResponse,
  type AdminUsersResponse,
  type AuthSessionResponse,
  type ClearAudienceResponse,
  type ClosureRequest,
  type ClosureResponse,
  type MeResponse,
  type MyStatsResponse,
  type OtpRequestResponse,
  type OtpVerifyBody,
  type PhotoListResponse,
  type FeedStatus,
  type HistoryResponse,
  type HospitalStatesResponse,
  type HospitalStateValue,
  type HealthResponse,
  type ScenarioListResponse,
  type IncidentsResponse,
  type OperatorAction,
  type OperatorActionResponse,
  type ReportInput,
  type ReportResponse,
  type ScenarioResponse,
  type SimAction,
  type SimResponse,
} from '@vighnaway/contracts';
import { API_URL } from './env';

/** Anything with a Zod-style parse; keeps the console free of a direct zod import. */
interface Parser<T> {
  parse(data: unknown): T;
}

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_ON_ROAD'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL'
  | 'NETWORK'
  | 'BAD_RESPONSE';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * A message for any error: the server's own wording, and for a rejected request the fields it
 * refused ("The request is not valid (Unrecognized key(s) in object: 'origin')"), so a version
 * mismatch between the app and the API is visible instead of a bare "not valid".
 */
export function describeApiError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_FAILED' || !Array.isArray(err.details) || err.details.length === 0) return err.message;
  const parts = err.details
    .slice(0, 3)
    .map((d) => {
      const i = d as { path?: unknown; message?: unknown };
      const path = Array.isArray(i.path) ? i.path.join('.') : '';
      return [path, typeof i.message === 'string' ? i.message : ''].filter(Boolean).join(': ');
    })
    .filter(Boolean);
  return parts.length ? `${err.message} (${parts.join('; ')})` : err.message;
}

const STATUS_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'NOT_ON_ROAD',
  429: 'RATE_LIMITED',
};

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Sends the request and turns a network failure or a non-2xx answer into an ApiError. */
async function send(path: string, accept: string, opts: RequestOptions): Promise<Response> {
  const base = opts.baseUrl ?? API_URL;
  const headers: Record<string, string> = { accept };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError('NETWORK', `Could not reach ${base}`);
  }
  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* body not JSON */
    }
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status, parsed.data.error.details);
    }
    throw new ApiError(STATUS_CODE[res.status] ?? 'INTERNAL', `HTTP ${res.status}`, res.status);
  }
  return res;
}

/** GET raw bytes (an operator-only image). The caller turns the Blob into an object URL. */
export async function requestBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const res = await send(path, 'image/jpeg', opts);
  try {
    return await res.blob();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server sent a response that is not an image', res.status);
  }
}

export async function request<T>(path: string, schema: Parser<T> | null, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, 'application/json', opts);
  if (res.status === 204 || schema === null) return undefined as T;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server sent a response that is not JSON', res.status);
  }
  try {
    return schema.parse(json);
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server sent a response that does not match the contract', res.status);
  }
}

export const api = {
  health: (o?: RequestOptions): Promise<HealthResponse> => request(API_PATHS.health, HealthResponseSchema, o),
  scenarios: (o?: RequestOptions): Promise<ScenarioListResponse> => request(API_PATHS.scenarios, ScenarioListResponseSchema, o),
  feed: (id: string, o?: RequestOptions): Promise<FeedStatus> => request(API_PATHS.feed(id), FeedStatusSchema, o),
  /** Every incident version of the current run, for decision replay. */
  history: (id: string, o?: RequestOptions): Promise<HistoryResponse> =>
    request(API_PATHS.history(id), HistoryResponseSchema, o),
  scenario: (id: string, o?: RequestOptions): Promise<ScenarioResponse> =>
    request(API_PATHS.scenario(id), ScenarioResponseSchema, o),
  incidents: (id: string, sinceSeq: number | null, o?: RequestOptions): Promise<IncidentsResponse> =>
    request(
      sinceSeq === null ? API_PATHS.incidents(id) : `${API_PATHS.incidents(id)}?sinceSeq=${sinceSeq}`,
      IncidentsResponseSchema,
      o,
    ),
  report: (id: string, input: ReportInput, o?: RequestOptions): Promise<ReportResponse> =>
    request(API_PATHS.reports(id), ReportResponseSchema, { ...o, method: 'POST', body: input }),
  incidentAction: (
    id: string,
    incidentId: string,
    action: OperatorAction,
    token: string,
    o?: RequestOptions,
  ): Promise<OperatorActionResponse> =>
    request(API_PATHS.incidentAction(id, incidentId, action), OperatorActionResponseSchema, {
      ...o,
      method: 'POST',
      body: {},
      token,
    }),
  /** Operator: dismisses every open incident that only demo-audience reports support. */
  clearAudience: (id: string, token: string, o?: RequestOptions): Promise<ClearAudienceResponse> =>
    request(API_PATHS.clearAudience(id), ClearAudienceResponseSchema, { ...o, method: 'POST', body: {}, token }),
  /** Operator: preview (confirm false) or create a Verified closure along a drawn line. */
  closeRoad: (id: string, body: ClosureRequest, token: string, o?: RequestOptions): Promise<ClosureResponse> =>
    request(API_PATHS.closures(id), ClosureResponseSchema, { ...o, method: 'POST', body, token }),
  /** Hospital states (P2-4): public list; an operator sets one. */
  hospitals: (id: string, o?: RequestOptions): Promise<HospitalStatesResponse> => request(API_PATHS.hospitals(id), HospitalStatesResponseSchema, o),
  setHospital: (id: string, placeId: string, state: HospitalStateValue, token: string, o?: RequestOptions): Promise<HospitalStatesResponse> =>
    request(API_PATHS.hospital(id, placeId), HospitalStatesResponseSchema, { ...o, method: 'PUT', body: { state }, token }),
  /** Operator: the photos citizens attached to reports, newest first. The list never carries image bytes. */
  photos: (id: string, token: string, o?: RequestOptions): Promise<PhotoListResponse> =>
    request(API_PATHS.photos(id), PhotoListResponseSchema, { ...o, token }),
  /** Operator: one report's photo (JPEG). An <img src> cannot send the header, so it is fetched as a Blob. */
  photoBlob: (id: string, reportId: string, token: string, o?: RequestOptions): Promise<Blob> =>
    requestBlob(API_PATHS.reportPhoto(id, reportId), { ...o, token }),
  sim: (id: string, o?: RequestOptions): Promise<SimResponse> => request(API_PATHS.sim(id), SimResponseSchema, o),
  simAction: (id: string, action: SimAction, token: string, o?: RequestOptions): Promise<SimResponse> =>
    request(API_PATHS.simAction(id, action), SimResponseSchema, { ...o, method: 'POST', body: {}, token }),
  /** Accounts: email one-time code. The same answer whether or not the email has an account. */
  otpRequest: (email: string, o?: RequestOptions): Promise<OtpRequestResponse> =>
    request(API_PATHS.authOtpRequest, OtpRequestResponseSchema, { ...o, method: 'POST', body: { email, client: 'web' } }),
  otpVerify: (body: Omit<OtpVerifyBody, 'client'>, o?: RequestOptions): Promise<AuthSessionResponse> =>
    request(API_PATHS.authOtpVerify, AuthSessionResponseSchema, { ...o, method: 'POST', body: { ...body, client: 'web' } }),
  me: (token: string, o?: RequestOptions): Promise<MeResponse> => request(API_PATHS.authMe, MeResponseSchema, { ...o, token }),
  logout: (token: string, o?: RequestOptions): Promise<void> =>
    request<void>(API_PATHS.authLogout, null, { ...o, method: 'POST', body: {}, token }),
  myStats: (token: string, o?: RequestOptions): Promise<MyStatsResponse> => request(API_PATHS.myStats, MyStatsResponseSchema, { ...o, token }),
  adminUsers: (token: string, o?: RequestOptions): Promise<AdminUsersResponse> =>
    request(API_PATHS.adminUsers, AdminUsersResponseSchema, { ...o, token }),
  adminCreateUser: (token: string, body: AdminCreateUserBody, o?: RequestOptions): Promise<AdminUserResponse> =>
    request(API_PATHS.adminUsers, AdminUserResponseSchema, { ...o, method: 'POST', body, token }),
  adminUpdateUser: (token: string, id: string, body: AdminUpdateUserBody, o?: RequestOptions): Promise<AdminUserResponse> =>
    request(API_PATHS.adminUser(id), AdminUserResponseSchema, { ...o, method: 'POST', body, token }),
  operatorCheck: (token: string, o?: RequestOptions): Promise<void> =>
    request<void>(API_PATHS.operatorCheck, null, { ...o, token }),
};
