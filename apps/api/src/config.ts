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
  /** CAP 1.2 rain-alert feed (SACHET publishes CAP). Empty disables the alert feed. */
  ALERT_FEED_URL: z.string().default(''),
  /** The live scenario the alert feed writes into. It never touches simulated scenarios. */
  ALERT_FEED_SCENARIO: z.string().default('andheri-live'),
  /** Seconds between alert reads; 0 = only on POST /scenarios/:id/alerts/poll. */
  ALERT_POLL_SECONDS: z.coerce.number().int().min(0).default(600),
  /** How far (m) a feed geometry may be from a graph edge to count as on it. */
  TRAFFIC_MATCH_DISTANCE_M: z.coerce.number().min(1).max(200).default(25),
  NODE_ENV: z.string().default('development'),
  /** Accounts. AUTH_SECRET keys the HMAC of every one-time code; change it outside local development. */
  AUTH_SECRET: z.string().min(16).default('vighnaway-dev-auth-secret'),
  /** Comma-separated emails that always sign in as admin (how the first admin is made). */
  ADMIN_EMAILS: z.string().default(''),
  /** SMTP connection URL for the one-time code email, e.g. smtps://user:pass@smtp.example.com. Empty = log the code (never in production). */
  SMTP_URL: z.string().default(''),
  /**
   * The same thing as separate settings, easier than one URL because nothing has to be URL-encoded (a password with a
   * space or an @ goes in as it is). When SMTP_HOST is set these are used and SMTP_URL is ignored.
   */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.string().default(''),
  /** 'true' = TLS from the first byte (usual on port 465); 'false' = start plain, then upgrade (usual on 587 and 2525). Empty = true on 465, else false. */
  SMTP_SECURE: z.string().default(''),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('VIGHNAWAY <no-reply@localhost>'),
  OTP_TTL_S: z.coerce.number().int().min(60).max(3600).default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OTP_RESEND_S: z.coerce.number().int().min(0).max(600).default(60),
  OTP_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().int().min(1).default(5),
  OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(30),
  SESSION_TTL_WEB_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  SESSION_TTL_MOBILE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
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
  nodeEnv: string;
  auth: {
    secret: string;
    adminEmails: string[];
    smtpUrl: string;
    /** From SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS; null when SMTP_HOST is empty. */
    smtp: SmtpSettings | null;
    mailFrom: string;
    otpTtlS: number;
    otpMaxAttempts: number;
    otpResendS: number;
    otpMaxPerEmailPerHour: number;
    otpMaxPerIpPerHour: number;
    sessionTtlWebS: number;
    sessionTtlMobileS: number;
  };
  alerts: {
    url: string;
    scenarioId: string;
    pollSeconds: number;
  };
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
    nodeEnv: e.NODE_ENV,
    auth: {
      secret: e.AUTH_SECRET,
      adminEmails: e.ADMIN_EMAILS.split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
      smtpUrl: e.SMTP_URL,
      smtp: smtpSettings(e),
      mailFrom: e.MAIL_FROM,
      otpTtlS: e.OTP_TTL_S,
      otpMaxAttempts: e.OTP_MAX_ATTEMPTS,
      otpResendS: e.OTP_RESEND_S,
      otpMaxPerEmailPerHour: e.OTP_MAX_PER_EMAIL_PER_HOUR,
      otpMaxPerIpPerHour: e.OTP_MAX_PER_IP_PER_HOUR,
      sessionTtlWebS: e.SESSION_TTL_WEB_HOURS * 3600,
      sessionTtlMobileS: e.SESSION_TTL_MOBILE_DAYS * 86400,
    },
    alerts: {
      url: e.ALERT_FEED_URL,
      scenarioId: e.ALERT_FEED_SCENARIO,
      pollSeconds: e.ALERT_POLL_SECONDS,
    },
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

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

/** The separate SMTP settings, or null when no host is set (then SMTP_URL, or the log mailer, applies). */
export function smtpSettings(e: { SMTP_HOST: string; SMTP_PORT: string; SMTP_SECURE: string; SMTP_USER: string; SMTP_PASS: string }): SmtpSettings | null {
  const host = e.SMTP_HOST.trim();
  if (!host) return null;
  const port = Number.parseInt(e.SMTP_PORT.trim() || '587', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a port number such as 587 or 465');
  const secureText = e.SMTP_SECURE.trim().toLowerCase();
  const secure = secureText === '' ? port === 465 : secureText === 'true' || secureText === '1';
  return { host, port, secure, user: e.SMTP_USER, pass: e.SMTP_PASS };
}
