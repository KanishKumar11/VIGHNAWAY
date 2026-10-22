import { describe, expect, it } from 'vitest';
import { loadConfig, smtpSettings } from '../../src/config';

const none = { SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '', SMTP_USER: '', SMTP_PASS: '' };

describe('separate SMTP settings', () => {
  it('is off without a host, so SMTP_URL or the log mailer applies', () => {
    expect(smtpSettings(none)).toBeNull();
    expect(loadConfig({}).auth.smtp).toBeNull();
  });

  it('keeps a password exactly as typed, spaces and @ included', () => {
    const s = smtpSettings({ ...none, SMTP_HOST: 'smtp.example.com', SMTP_USER: 'me@example.com', SMTP_PASS: 'my pass@123' });
    expect(s).toEqual({ host: 'smtp.example.com', port: 587, secure: false, user: 'me@example.com', pass: 'my pass@123' });
  });

  it('uses TLS from the start on port 465 unless told otherwise', () => {
    expect(smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: '465' })?.secure).toBe(true);
    expect(smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: '2525' })?.secure).toBe(false);
    expect(smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: '2525', SMTP_SECURE: 'true' })?.secure).toBe(true);
    expect(smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_SECURE: 'false' })?.secure).toBe(false);
  });

  it('refuses a port that is not a port', () => {
    expect(() => smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/);
    expect(() => smtpSettings({ ...none, SMTP_HOST: 'h', SMTP_PORT: '70000' })).toThrow(/SMTP_PORT/);
  });

  it('comes through loadConfig', () => {
    expect(loadConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p q' }).auth.smtp).toMatchObject({ host: 'smtp.example.com', port: 465, secure: true, pass: 'p q' });
  });
});
