import { Logger } from '@nestjs/common';
import type { AppConfig, SmtpSettings } from '../config';
import type { Mailer } from './auth.types';

import { renderOtpEmail } from './otpEmail';

/** Local development: no mail server, so the code goes to the API log. Never used in production. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    this.logger.warn(`SMTP_HOST is not set: sign-in code for ${to} is ${code} (expires in ${ttlMinutes} min)`);
  }
}

/** Production without SMTP_HOST or SMTP_URL: refuse rather than silently drop or log codes. */
export class DisabledMailer implements Mailer {
  async sendOtp(): Promise<void> {
    throw new Error('SMTP_HOST (or SMTP_URL) is not set; sign-in emails cannot be sent');
  }
}

/**
 * nodemailer waits two minutes to connect by default, so a mail host the server cannot reach (a blocked SMTP port, a wrong
 * host) kept the sign-in request hanging for 2 minutes before it failed. These limits make it fail in seconds, and the
 * error names the cause (ETIMEDOUT, ECONNREFUSED, EAUTH) in the API log.
 */
const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 } as const;

export class SmtpMailer implements Mailer {
  /** `server` is the separate settings (SMTP_HOST and friends) or a connection URL (SMTP_URL). */
  constructor(
    private readonly server: SmtpSettings | string,
    private readonly from: string,
  ) {}

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    const nodemailer = await import('nodemailer');
    const s = this.server;
    const transport =
      typeof s === 'string'
        ? nodemailer.createTransport(s, SMTP_TIMEOUTS)
        : nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, ...(s.user ? { auth: { user: s.user, pass: s.pass } } : null), ...SMTP_TIMEOUTS });
    const { subject, html, text } = renderOtpEmail(code, ttlMinutes);
    try {
      await transport.sendMail({ from: this.from, to, subject, html, text });
    } finally {
      transport.close();
    }
  }
}

export function createMailer(config: AppConfig): Mailer {
  if (config.auth.smtp) return new SmtpMailer(config.auth.smtp, config.auth.mailFrom);
  if (config.auth.smtpUrl) return new SmtpMailer(config.auth.smtpUrl, config.auth.mailFrom);
  return config.nodeEnv === 'production' ? new DisabledMailer() : new LogMailer();
}
