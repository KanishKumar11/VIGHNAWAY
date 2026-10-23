import { describe, expect, it } from 'vitest';
import { phoneBrand, phoneThemes } from '../../../../packages/tokens/src/themes';
import { EMAIL_PALETTE, renderOtpEmail } from '../../src/auth/otpEmail';

describe('sign-in code email', () => {
  const mail = renderOtpEmail('482913', 10);

  it('carries the code, grouped in the HTML and unbroken in plain text', () => {
    expect(mail.html).toContain('482 913');
    expect(mail.text).toContain('482913');
    expect(mail.subject).toBe('482913 is your VIGHNAWAY sign-in code');
  });

  it('says it works once and when it expires, in both bodies', () => {
    expect(mail.html).toContain('Works once · expires in 10 minutes');
    expect(mail.text).toContain('expires in 10 minutes');
    expect(renderOtpEmail('111222', 1).text).toContain('expires in 1 minute.');
  });

  it('is self-contained: no scripts, remote images or stylesheets to block or track', () => {
    expect(mail.html).not.toMatch(/<script|<img|<link|url\(|@import/i);
  });

  it('never uses the words the product does not claim', () => {
    expect(`${mail.html} ${mail.text}`).not.toMatch(/\b(safe|safest|safety|guaranteed?)\b/i);
  });

  it('escapes anything that is not a plain code', () => {
    expect(renderOtpEmail('<b>1</b>', 5).html).not.toContain('<b>1</b>');
  });

  it('uses the phone theme and brand colours from packages/tokens', () => {
    const light = phoneThemes.light;
    expect(EMAIL_PALETTE).toMatchObject({
      paper: light.shell,
      card: light.panel,
      line: light.panelLine,
      sunken: light.panelSunken,
      ink: light.ink,
      inkMuted: light.inkMuted,
      accent: light.accent,
      onAccent: light.onAccent,
      accentInk: light.accentInk,
      hero: phoneBrand.light.hero,
      onHero: phoneBrand.light.onHero,
    });
  });
});
