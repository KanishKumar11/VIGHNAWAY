import { z } from 'zod';

/** Everything the API reads from the environment. Domains, keys and hosts are never hard-coded. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1).default('postgres://vighnaway:vighnaway@127.0.0.1:5432/vighnaway'),
  /** Shared secret for operator and simulation actions. Empty means every operator call is 401. */
  OPERATOR_TOKEN: z.string().default(''),
  /** Comma-separated allowlist of browser origins (console, report page). */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DEVICE_HASH_SALT: z.string().default('vighnaway-dev-salt'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Set when the API sits behind a reverse proxy, so req.ip is the client address. */
  TRUST_PROXY: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  /** Report throttling (per minute). Defaults match docs/CONTRACTS.md. */
  REPORT_IP_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  REPORT_DEVICE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(5),
  /** Real milliseconds between simulation ticks (1 tick per real second). */
  SIM_TICK_MS: z.coerce.number().int().min(50).default(1000),
  /** TomTom Traffic API key (server-side only). Empty disables the live traffic feed. */
  TOMTOM_API_KEY: z.string().default(''),
  TOMTOM_BASE_URL: z.string().url().default('https://api.tomtom.com'),
  /** The live scenario the feed writes into. The feed never touches simulated scenarios. */
  TRAFFIC_FEED_SCENARIO: z.string().default('andheri-live'),
  /** Seconds between polls (one request each); 0 = only on POST /scenarios/:id/feed/poll. */
  TRAFFIC_POLL_SECONDS: z.coerce.number().int().min(0).default(120),
  /** How far (m) a feed geometry may be from a graph edge to count as on it. */
  TRAFFIC_MATCH_DISTANCE_M: z.coerce.number().min(1).max(200).default(25),
});

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  operatorToken: string;
  corsOrigins: string[];
  deviceHashSalt: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  trustProxy: boolean;
  reportIpLimitPerMin: number;
  reportDeviceLimitPerMin: number;
  simTickMs: number;
  traffic: {
    tomtomApiKey: string;
    tomtomBaseUrl: string;
    scenarioId: string;
    pollSeconds: number;
    matchDistanceM: number;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
export const API_VERSION = '0.1.0';
export const BODY_LIMIT = '16kb';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const blankToUndefined = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const e = EnvSchema.parse(blankToUndefined);
  return {
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    operatorToken: e.OPERATOR_TOKEN,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    deviceHashSalt: e.DEVICE_HASH_SALT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    reportIpLimitPerMin: e.REPORT_IP_LIMIT_PER_MIN,
    reportDeviceLimitPerMin: e.REPORT_DEVICE_LIMIT_PER_MIN,
    simTickMs: e.SIM_TICK_MS,
    traffic: {
      tomtomApiKey: e.TOMTOM_API_KEY,
      tomtomBaseUrl: e.TOMTOM_BASE_URL,
      scenarioId: e.TRAFFIC_FEED_SCENARIO,
      pollSeconds: e.TRAFFIC_POLL_SECONDS,
      matchDistanceM: e.TRAFFIC_MATCH_DISTANCE_M,
    },
  };
}

/** Requests without an Origin (native app, curl) are allowed; browsers must be on the list. */
export function isOriginAllowed(config: AppConfig, origin: string | undefined | null): boolean {
  if (!origin) return true;
  return config.corsOrigins.includes(origin.replace(/\/+$/, ''));
}
