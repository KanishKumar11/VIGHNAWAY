import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';

const json = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('API client', () => {
  it('parses responses with the contract schemas', async () => {
    const fetchImpl = json(200, { scenarioId: 'andheri-monsoon', seq: 0, full: true, runId: 'r', simTimeS: 0, incidents: [] });
    const r = await api.incidents('andheri-monsoon', 4, { fetchImpl, baseUrl: 'http://api' });
    expect(r.full).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://api/scenarios/andheri-monsoon/incidents?sinceSeq=4', expect.anything());
  });

  it('omits sinceSeq for a full snapshot', async () => {
    const fetchImpl = json(200, { scenarioId: 'andheri-monsoon', seq: 0, full: true, runId: 'r', simTimeS: 0, incidents: [] });
    await api.incidents('andheri-monsoon', null, { fetchImpl, baseUrl: 'http://api' });
    expect(fetchImpl).toHaveBeenCalledWith('http://api/scenarios/andheri-monsoon/incidents', expect.anything());
  });

  it('sends the operator token as a Bearer header', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await api.operatorCheck('secret', { fetchImpl, baseUrl: 'http://api' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
  });

  it('maps error bodies to ApiError codes', async () => {
    const fetchImpl = json(422, { error: { code: 'NOT_ON_ROAD', message: 'Not on a known road' } });
    await expect(api.report('andheri-monsoon', {} as never, { fetchImpl, baseUrl: 'http://api' })).rejects.toMatchObject({ code: 'NOT_ON_ROAD', status: 422 });
  });

  it('reports network failures and contract mismatches', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(api.health({ fetchImpl: down, baseUrl: 'http://api' })).rejects.toMatchObject({ code: 'NETWORK' });
    const bad = json(200, { nope: true });
    const err = await api.health({ fetchImpl: bad, baseUrl: 'http://api' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('BAD_RESPONSE');
  });
});
