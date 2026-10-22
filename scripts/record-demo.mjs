// P0-5.c: records the console running the scripted demo as a video (the fallback to play if the live demo fails).
// Two recordings: the normal console in the light theme, and the presenter view. Both show the Simulated label.
//
// Needs a RUNNING API and console, and playwright-core (not a repo dependency):
//   npm i --no-save playwright-core
//   OPERATOR_TOKEN=... CONSOLE_URL=http://localhost:3000 API_URL=http://localhost:4000 \
//     CHROME=/path/to/chrome node scripts/record-demo.mjs
// It RESETS the scenario, so do not run it during a live demo. Videos go to docs/demo/ (webm). The operator token
// is read from the environment, put in the recorded browser's tab storage only, and never printed or recorded.
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CONSOLE = (process.env.CONSOLE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TOKEN = process.env.OPERATOR_TOKEN || '';
const CHROME = process.env.CHROME || undefined;
const OUT = process.env.DEMO_OUT || path.resolve(import.meta.dirname, '..', 'docs', 'demo');
const SID = 'andheri-monsoon';
/** Real seconds the scripted run takes at 10 simulated seconds per real second (14:05 to about 14:15), plus a tail. */
const RUN_MS = 75_000;
if (!TOKEN) {
  console.error('Set OPERATOR_TOKEN (the server-side operator token). It is never printed.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const call = (p) => fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: '{}' });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function record(name, { presenter }) {
  await call(`/scenarios/${SID}/sim/reset`);
  const dir = path.join(OUT, `.tmp-${name}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', recordVideo: { dir, size: { width: 1440, height: 900 } } });
  // The token is set before any page script runs, so it is never typed on screen.
  await ctx.addInitScript((t) => sessionStorage.setItem('vighnaway.operatorToken', t), TOKEN);
  const page = await ctx.newPage();
  await page.goto(`${CONSOLE}/console`, { waitUntil: 'load', timeout: 240_000 });
  // The first plan on the real graph takes a moment; wait for a recommended route before the run starts.
  await page.waitForFunction(() => /Via [A-Z]/.test(document.body.innerText), null, { timeout: 180_000 });
  await page.waitForTimeout(2500);
  if (presenter) await page.keyboard.press('p');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await page.waitForTimeout(RUN_MS);
  await page.close();
  await ctx.close();
  const file = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (file) renameSync(path.join(dir, file), path.join(OUT, `console-demo-${name}.webm`));
  console.log(`recorded ${name}`);
}

try {
  await record('light', { presenter: false });
  await record('presenter', { presenter: true });
} finally {
  await browser.close();
  await call(`/scenarios/${SID}/sim/reset`);
}
