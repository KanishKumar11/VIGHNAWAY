import {
  API_PATHS,
  ApiErrorSchema,
  FeedStatusSchema,
  HealthResponseSchema,
  IncidentsResponseSchema,
  ReportResponseSchema,
  ScenarioListResponseSchema,
  ScenarioResponseSchema,
  type FeedStatus,
  type HealthResponse,
  type IncidentsResponse,
  type ReportInput,
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
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const TIMEOUT_MS = 8000;

/** The part of a Zod schema we use (zod is a dependency of contracts, not of this app). */
interface Parser<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

async function request<T>(
  baseUrl: string,
  path: string,
  schema: Parser<T>,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : null) },
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
    throw new ApiRequestError(err.success ? err.data.error.message : `HTTP ${res.status}`, res.status, err.success ? err.data.error.code : null);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiRequestError('Unexpected response from the server', res.status, 'INVALID_RESPONSE');
  return parsed.data;
}

export const api = {
  health: (baseUrl: string): Promise<HealthResponse> =>
    request(baseUrl, API_PATHS.health, HealthResponseSchema, { timeoutMs: 5000 }),
  scenarios: (baseUrl: string): Promise<ScenarioListResponse> =>
    request(baseUrl, API_PATHS.scenarios, ScenarioListResponseSchema, { timeoutMs: 5000 }),
  feed: (baseUrl: string, id: string): Promise<FeedStatus> => request(baseUrl, API_PATHS.feed(id), FeedStatusSchema, { timeoutMs: 5000 }),
  scenario: (baseUrl: string, id: string): Promise<ScenarioResponse> =>
    request(baseUrl, API_PATHS.scenario(id), ScenarioResponseSchema),
  incidents: (baseUrl: string, id: string, sinceSeq?: number): Promise<IncidentsResponse> =>
    request(
      baseUrl,
      `${API_PATHS.incidents(id)}${sinceSeq === undefined ? '' : `?sinceSeq=${sinceSeq}`}`,
      IncidentsResponseSchema,
    ),
  report: (baseUrl: string, id: string, input: ReportInput): Promise<ReportResponse> =>
    request(baseUrl, API_PATHS.reports(id), ReportResponseSchema, { method: 'POST', body: input }),
};
