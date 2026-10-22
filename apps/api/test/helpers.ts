import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ReportInput } from '@vighnaway/contracts';
import { andheriScenario } from '@vighnaway/scenario-data';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { type AppConfig, loadConfig } from '../src/config';
import { TEST_DATABASE_URL, TEST_ORIGIN, TEST_TOKEN } from './env';

export const SID = andheriScenario.id;
export const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };

/**
 * Points on the real graph (from the scripted scenario). Names kept from the schematic fixture:
 * SUBWAY is the Andheri Subway underpass, NAGARDAS the congested G K Gokhale Flyover, HOSPITAL_ROAD
 * the single unnamed road into Holy Spirit Hospital.
 */
export const SUBWAY = { lat: 19.12379, lng: 72.85037 };
export const NAGARDAS = { lat: 19.11463, lng: 72.85175 };
export const HOSPITAL_ROAD = { lat: 19.1249081, lng: 72.8669246 };
/** More than 100 m from any road. */
export const OFF_ROAD = { lat: 19.105, lng: 72.8555 };

export interface TestApp {
  app: NestExpressApplication;
  url: string;
  config: AppConfig;
  http: () => ReturnType<typeof request>;
  sockets: Socket[];
  close: () => Promise<void>;
}

export async function startApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    OPERATOR_TOKEN: TEST_TOKEN,
    CORS_ORIGINS: TEST_ORIGIN,
    LOG_LEVEL: 'silent',
    DEVICE_HASH_SALT: 'test-salt',
    REPORT_IP_LIMIT_PER_MIN: '10000',
    REPORT_DEVICE_LIMIT_PER_MIN: '10000',
    ...env,
  });
  const app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const sockets: Socket[] = [];
  return {
    app,
    url,
    config,
    http: () => request(app.getHttpServer()),
    sockets,
    close: async () => {
      for (const s of sockets) s.disconnect();
      await app.close();
    },
  };
}

export function report(overrides: Partial<ReportInput> & { deviceId: string }): ReportInput {
  return { type: 'flood', depth: 'ankle', point: SUBWAY, observedPersonally: true, ...overrides } as ReportInput;
}

export async function resetScenario(t: TestApp): Promise<number> {
  const res = await t.http().post(`/scenarios/${SID}/sim/reset`).set(AUTH).send({});
  if (res.status !== 200) throw new Error(`reset failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.sim.seq as number;
}

/** Connected /live client that records every event it receives. */
export async function connect(t: TestApp, opts: { origin?: string } = {}): Promise<Socket & { received: Array<[string, unknown]> }> {
  const s = io(`${t.url}/live`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: opts.origin ? { Origin: opts.origin } : undefined,
  }) as Socket & { received: Array<[string, unknown]> };
  s.received = [];
  s.onAny((event: string, payload: unknown) => s.received.push([event, payload]));
  t.sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', (e) => reject(e));
  });
  return s;
}

export async function join(s: Socket, scenarioId = SID): Promise<{ ok: boolean; seq: number; runId: string }> {
  return s.timeout(5000).emitWithAck('join', { scenarioId });
}

/** Resolves with the first matching event payload (already received or arriving within timeout). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: payload type chosen by the caller
export function waitForEvent<T = any>(
  s: Socket & { received: Array<[string, unknown]> },
  event: string,
  pred: (p: T) => boolean = () => true,
  timeoutMs = 5000,
): Promise<T> {
  const hit = s.received.find(([e, p]) => e === event && pred(p as T));
  if (hit) return Promise.resolve(hit[1] as T);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(event, on);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const on = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(timer);
      s.off(event, on);
      resolve(p);
    };
    s.on(event, on);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
