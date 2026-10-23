import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import type { Mailer } from './auth.types';

import { renderOtpEmail } from './otpEmail';

/** Local development: no mail server, so the code goes to the API log. Never used in production. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    this.logger.warn(`SMTP_URL is not set: sign-in code for ${to} is ${code} (expires in ${ttlMinutes} min)`);
  }
}

/** Production without SMTP_URL: refuse rather than silently drop or log codes. */
export class DisabledMailer implements Mailer {
  async sendOtp(): Promise<void> {
    throw new Error('SMTP_URL is not set; sign-in emails cannot be sent');
  }
}

export class SmtpMailer implements Mailer {
  constructor(
    private readonly smtpUrl: string,
    private readonly from: string,
  ) {}

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport(this.smtpUrl);
    const { subject, html, text } = renderOtpEmail(code, ttlMinutes);
    await transport.sendMail({ from: this.from, to, subject, html, text });
  }
}

export function createMailer(config: AppConfig): Mailer {
  if (config.auth.smtpUrl) return new SmtpMailer(config.auth.smtpUrl, config.auth.mailFrom);
  return config.nodeEnv === 'production' ? new DisabledMailer() : new LogMailer();
}
