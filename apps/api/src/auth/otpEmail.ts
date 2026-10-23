/**
 * The sign-in code email: a branded HTML message with a plain-text twin. Mail clients ignore stylesheets and
 * custom properties, so this is table layout with inline styles and solid colours (no gradients, no images, no
 * remote fonts: nothing to block or track). The palette is the phone's "Monsoon Signal" light theme and brand
 * layer from packages/tokens; test/unit/otp-email.test.ts keeps the two in step.
 */
export const EMAIL_PALETTE = {
  paper: '#F6F1E9', // phoneThemes.light.shell
  card: '#FFFFFF', // phoneThemes.light.panel
  line: '#E6DCCB', // phoneThemes.light.panelLine
  sunken: '#F1EADE', // phoneThemes.light.panelSunken
  ink: '#1A1030', // phoneThemes.light.ink
  inkMuted: '#4A3F66', // phoneThemes.light.inkMuted
  accent: '#C8F560', // phoneThemes.light.accent
  onAccent: '#14102A', // phoneThemes.light.onAccent
  accentInk: '#3F6212', // phoneThemes.light.accentInk
  hero: '#26123F', // phoneBrand.light.hero
  onHero: '#FFFFFF', // phoneBrand.light.onHero
} as const;

export interface OtpEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT = "'Manrope','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "482913" becomes "482 913": easier to read aloud and to compare; the plain-text copy keeps it unbroken for copying. */
const grouped = (code: string): string => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export function renderOtpEmail(code: string, ttlMinutes: number): OtpEmail {
  const c = EMAIL_PALETTE;
  const minutes = `${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}`;
  const subject = `${code} is your VIGHNAWAY sign-in code`;
  const preheader = `Your one-time code expires in ${minutes}.`;

  const text = [
    `Your VIGHNAWAY sign-in code`,
    ``,
    `${code}`,
    ``,
    `Enter it where you asked to sign in. It works once and expires in ${minutes}.`,
    ``,
    `Never share this code with anyone. VIGHNAWAY will never ask you for it.`,
    `If you did not ask for it, you can ignore this email: nothing happens unless the code is used.`,
    ``,
    `VIGHNAWAY: emergency-aware navigation for citizens and the control room.`,
    ``,
  ].join('\n');

  // Every block is its own table so Outlook (Word's renderer) keeps the spacing and the rounded corners degrade cleanly.
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${c.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${c.paper};font-size:1px;line-height:1px;">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.paper}" style="background-color:${c.paper};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Brand -->
        <tr>
          <td style="padding:0 4px 20px 4px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="36" height="36" align="center" valign="middle" bgcolor="${c.accent}" style="width:36px;height:36px;background-color:${c.accent};border-radius:12px;font-family:${FONT};font-size:18px;font-weight:800;line-height:36px;color:${c.onAccent};">V</td>
                <td style="padding-left:12px;font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:3px;color:${c.ink};">VIGHNAWAY</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td bgcolor="${c.card}" style="background-color:${c.card};border:1px solid ${c.line};border-radius:24px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- Hero band -->
              <tr>
                <td bgcolor="${c.hero}" style="background-color:${c.hero};padding:32px 32px 28px 32px;font-family:${FONT};">
                  <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${c.accent};">Sign-in code</p>
                  <h1 style="margin:0;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.5px;color:${c.onHero};">Here is your code</h1>
                </td>
              </tr>

              <!-- Code -->
              <tr>
                <td style="padding:32px 32px 8px 32px;font-family:${FONT};">
                  <p style="margin:0 0 20px 0;font-size:16px;line-height:26px;color:${c.inkMuted};">Enter this code where you asked to sign in to VIGHNAWAY.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${c.sunken}" style="background-color:${c.sunken};border:1px solid ${c.line};border-radius:16px;padding:22px 12px;">
                        <span style="font-family:${MONO};font-size:40px;line-height:48px;font-weight:700;letter-spacing:8px;color:${c.ink};white-space:nowrap;">${escapeHtml(grouped(code))}</span>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                    <tr>
                      <td bgcolor="${c.accent}" style="background-color:${c.accent};border-radius:999px;padding:6px 14px;font-family:${FONT};font-size:13px;font-weight:700;color:${c.onAccent};">Works once · expires in ${escapeHtml(minutes)}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Notes -->
              <tr>
                <td style="padding:24px 32px 32px 32px;font-family:${FONT};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:${c.line};">&nbsp;</td></tr>
                  </table>
                  <p style="margin:20px 0 8px 0;font-size:15px;line-height:24px;font-weight:700;color:${c.ink};">Keep it to yourself</p>
                  <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${c.inkMuted};">VIGHNAWAY will never ask you for this code, by email, phone or message.</p>
                  <p style="margin:0 0 8px 0;font-size:15px;line-height:24px;font-weight:700;color:${c.ink};">Did not ask for it?</p>
                  <p style="margin:0;font-size:15px;line-height:24px;color:${c.inkMuted};">Ignore this email. Nothing happens unless the code is used.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 16px 0 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${c.inkMuted};">
            VIGHNAWAY · Emergency-aware navigation<br>
            You are receiving this because someone entered this address to sign in.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

  return { subject, html, text };
}
