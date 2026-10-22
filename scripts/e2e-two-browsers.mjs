// P1-3.d end-to-end: two phone-sized browsers report a knee-deep flood on the demo route, the console shows it
// Corroborated, the demo trip's route changes, an operator verifies it, and Resolve clears it.
//
// Needs a RUNNING API and console, and playwright-core (not a repo dependency):
//   npm i --no-save playwright-core        (or point NODE_PATH at a folder that has it)
//   OPERATOR_TOKEN=... CONSOLE_URL=http://localhost:3000 API_URL=http://localhost:4000 \
//     CHROME=/path/to/chrome node scripts/e2e-two-browsers.mjs
// It RESETS the scenario first, so do not run it during a live demo. Screenshots go to docs/design/e2e/.
// The operator token is read from the environment and is never printed.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CONSOLE = (process.env.CONSOLE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TOKEN = process.env.OPERATOR_TOKEN || '';
const CHROME = process.env.CHROME || undefined;
const SID = 'andheri-monsoon';
const OUT = process.env.E2E_OUT || path.resolve(import.meta.dirname, '..', 'docs', 'design', 'e2e');
// Andheri Subway: the road under the railway on the demo route (scripts/andheri_config.json).
const SUBWAY = { latitude: 19.12379, longitude: 72.85037 };
if (!TOKEN) {
  console.error('Set OPERATOR_TOKEN (the server-side operator token). It is never printed.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
};
const call = async (method, p, body, auth = false) => {
  const res = await fetch(`${API}${p}`, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
};
const incidents = async () => (await call('GET', `/scenarios/${SID}/incidents`)).json.incidents;
async function until(what, fn, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
};

try {
  await call('POST', `/scenarios/${SID}/sim/reset`, {}, true);

  // The console, as an operator (demo token, this tab only).
  const consoleCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await consoleCtx.addInitScript((t) => sessionStorage.setItem('vighnaway.operatorToken', t), TOKEN);
  const cons = await consoleCtx.newPage();
  watch(cons, 'console');
  await cons.goto(`${CONSOLE}/console`, { waitUntil: 'load', timeout: 240_000 });
  const currentRoute = async () => {
    const label = await cons.locator('article[aria-label^="Recommended route:"]').first().getAttribute('aria-label', { timeout: 2000 }).catch(() => null);
    return label ? label.replace(/^Recommended route:\s*/, '').trim() : null;
  };
  const startRoute = await until('a recommended route on the console', currentRoute, 180_000);
  check('the console shows a recommended route before any report', !!startRoute, startRoute);
  await cons.screenshot({ path: path.join(OUT, '01-console-before.png') });

  // Two phone-sized browsers with different device ids report knee-deep flooding at the subway.
  const reportAs = async (n) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, colorScheme: 'light', geolocation: SUBWAY, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    watch(page, `phone-${n}`);
    await page.goto(`${CONSOLE}/report?scenario=${SID}`, { waitUntil: 'load', timeout: 240_000 });
    await page.getByRole('button', { name: /^Flooding/ }).click();
    await page.getByRole('button', { name: /^Knee/ }).click();
    await page.getByRole('button', { name: /Use my location/ }).click();
    await until(`phone ${n} has a pin`, async () => !/No pin yet/.test(await page.locator('body').innerText()), 15_000).catch(() => undefined);
    await page.screenshot({ path: path.join(OUT, `02-phone-${n}-form.png`) });
    await page.getByRole('button', { name: /Send report/ }).click();
    await until(`phone ${n} report accepted`, async () => (await incidents()).some((i) => i.type === 'flood' && i.reportCount >= n), 30_000);
    await page.screenshot({ path: path.join(OUT, `03-phone-${n}-sent.png`) });
    await ctx.close();
  };
  await reportAs(1);
  const first = (await incidents()).find((i) => i.type === 'flood');
  check('one device makes an Unverified incident', first?.status === 'unverified' && first.deviceCount === 1, JSON.stringify(first && [first.status, first.deviceCount]));
  await reportAs(2);
  const flood = await until('the incident to be Corroborated', async () => (await incidents()).find((i) => i.type === 'flood' && i.status === 'corroborated'), 30_000).catch(() => null);
  check('a second device on the same road makes it Corroborated (2 devices)', !!flood && flood.deviceCount === 2, flood && String(flood.deviceCount));

  // The console shows it, and the demo trip's route changes.
  const changed = await until('the console route to change', async () => {
    const now = await currentRoute();
    return now && now !== startRoute ? now : null;
  }, 60_000).catch(() => null);
  check('the console lists it as Corroborated', /Corroborated/.test(await cons.locator('body').innerText()));
  check('the demo trip\'s recommended route changes', !!changed, `was ${startRoute}, now ${changed}`);
  await cons.screenshot({ path: path.join(OUT, '04-console-corroborated.png') });

  // The operator verifies it from the console.
  await cons.getByRole('button', { name: /^Verify/ }).first().click();
  const verified = await until('the incident to be Verified', async () => (await incidents()).find((i) => i.id === flood?.id && i.status === 'verified'), 30_000).catch(() => null);
  check('the operator verifies it (Verified by operator)', verified?.verifiedBy === 'operator' || verified?.verifiedBy === 'simulated_operator', verified && String(verified.verifiedBy));
  await cons.screenshot({ path: path.join(OUT, '05-console-verified.png') });

  // Resolve clears it, and the route can come back.
  const resolve = await call('POST', `/scenarios/${SID}/incidents/${encodeURIComponent(flood.id)}/resolve`, {}, true);
  check('Resolve clears it', resolve.status === 200 && resolve.json?.incident?.status === 'resolved', String(resolve.status));
  const back = await until('the console route to return', async () => ((await currentRoute()) === startRoute ? startRoute : null), 60_000).catch(() => null);
  check('the original route is recommended again once it is resolved', !!back, startRoute);
  await cons.screenshot({ path: path.join(OUT, '06-console-resolved.png') });

  check('no console errors in any browser', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.log(`FAIL  ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
  await call('POST', `/scenarios/${SID}/sim/reset`, {}, true);
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
