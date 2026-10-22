import {
  API_PATHS,
  ApiErrorSchema,
  HealthResponseSchema,
  IncidentsResponseSchema,
  OperatorActionResponseSchema,
  ReportResponseSchema,
  FeedStatusSchema,
  HistoryResponseSchema,
  ScenarioListResponseSchema,
  ScenarioResponseSchema,
  SimResponseSchema,
  type FeedStatus,
  type HistoryResponse,
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

const STATUS_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'NOT_ON_ROAD',
  429: 'RATE_LIMITED',
};

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function request<T>(path: string, schema: Parser<T> | null, opts: RequestOptions = {}): Promise<T> {
  const base = opts.baseUrl ?? API_URL;
  const headers: Record<string, string> = { accept: 'application/json' };
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
  sim: (id: string, o?: RequestOptions): Promise<SimResponse> => request(API_PATHS.sim(id), SimResponseSchema, o),
  simAction: (id: string, action: SimAction, token: string, o?: RequestOptions): Promise<SimResponse> =>
    request(API_PATHS.simAction(id, action), SimResponseSchema, { ...o, method: 'POST', body: {}, token }),
  operatorCheck: (token: string, o?: RequestOptions): Promise<void> =>
    request<void>(API_PATHS.operatorCheck, null, { ...o, token }),
};
