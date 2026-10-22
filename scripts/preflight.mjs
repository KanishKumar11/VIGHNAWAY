#!/usr/bin/env node
// pnpm preflight: run before every build or deploy (BUILD_PROMPT section 3).
// Lists missing or placeholder env vars, checks the database (PostGIS), the API health endpoint
// and CORS, prints the Android signing SHA-1 for the Google key, and fails if OPERATOR_TOKEN leaks
// into a public variable or a committed file. Every failure prints its fix.
//
// Reads process.env plus (if present) .env, apps/api/.env, apps/console/.env.local, apps/mobile/.env.
// Flags: --offline (skip DB and API checks), --strict (warnings fail too).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
const strict = args.has('--strict');

const files = ['.env', 'apps/api/.env', 'apps/console/.env.local', 'apps/console/.env', 'apps/mobile/.env'];
const env = {};
const sources = {};
for (const f of files) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    sources[m[1]] = f;
  }
}
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined) {
    env[k] = v;
    sources[k] = 'environment';
  }
}

const failures = [];
const warnings = [];
const ok = [];
const fail = (msg, fix) => failures.push({ msg, fix });
const warn = (msg, fix) => warnings.push({ msg, fix });

const PLACEHOLDER = /^(|changeme|change-me|todo|xxx+|your[-_ ].*|<.*>|placeholder|example)$/i;
const isSet = (k) => env[k] !== undefined && !PLACEHOLDER.test(String(env[k]).trim());

// 1. Environment variables
const required = [
  ['DATABASE_URL', 'API', 'Set DATABASE_URL in apps/api/.env, e.g. postgres://vighnaway:vighnaway@127.0.0.1:5432/vighnaway'],
  ['OPERATOR_TOKEN', 'API', 'Set a long random OPERATOR_TOKEN in apps/api/.env (openssl rand -hex 24). Never in a public variable.'],
  ['CORS_ORIGINS', 'API', 'Set CORS_ORIGINS in apps/api/.env to the console origins, e.g. http://localhost:3000,http://192.168.1.20:3000'],
  ['NEXT_PUBLIC_API_URL', 'Console', 'Set NEXT_PUBLIC_API_URL in apps/console/.env.local, e.g. http://localhost:4000'],
  ['EXPO_PUBLIC_API_URL', 'Mobile', "Set EXPO_PUBLIC_API_URL in apps/mobile/.env to the laptop's LAN address, e.g. http://192.168.1.20:4000"],
];
const recommended = [
  ['NEXT_PUBLIC_GOOGLE_MAPS_KEY', 'Console', 'Create a browser key restricted by HTTP referrer (localhost, LAN address, vighnaway.app) and set it in apps/console/.env.local. Without it the console shows the schematic view.'],
  ['GOOGLE_MAPS_ANDROID_KEY', 'Mobile build', 'Create an Android key restricted to package app.vighnaway plus the SHA-1 below and set it before building the dev client. A grey map with only the Google logo means a mismatch.'],
  ['PUBLIC_SITE_URL', 'Console', 'Set PUBLIC_SITE_URL (e.g. http://localhost:3000 or https://vighnaway.app). Used for CORS and the QR code.'],
  ['REPORT_URL', 'Console', 'Set REPORT_URL (e.g. http://<lan-ip>:3000/report) so the QR code opens on phones in the room.'],
  ['TOMTOM_API_KEY', 'API (live mode)', 'Optional: a TomTom key with the Traffic API enabled turns on the live traffic feed for the andheri-live scenario (docs/live-traffic.md). The simulated demo does not need it.'],
  ['API_BASE_URL', 'All', 'Set API_BASE_URL to the API origin used by preflight and deploys, e.g. http://localhost:4000'],
];
for (const [k, who, fix] of required) {
  if (!isSet(k)) fail(`${k} is missing or a placeholder (${who})`, fix);
  else ok.push(`${k} set (${sources[k]})`);
}
for (const [k, who, fix] of recommended) {
  if (!isSet(k)) warn(`${k} is missing or a placeholder (${who})`, fix);
  else ok.push(`${k} set (${sources[k]})`);
}

// 2. Operator token must never be public
const token = env.OPERATOR_TOKEN;
if (token && isSet('OPERATOR_TOKEN')) {
  if (token.length < 16) warn('OPERATOR_TOKEN is shorter than 16 characters', 'Use openssl rand -hex 24.');
  for (const [k, v] of Object.entries(env)) {
    if ((k.startsWith('EXPO_PUBLIC_') || k.startsWith('NEXT_PUBLIC_')) && v && v.includes(token)) {
      fail(`OPERATOR_TOKEN appears in public variable ${k} (${sources[k]})`, `Remove it from ${k}; public variables are shipped to every client.`);
    }
    if ((k.startsWith('EXPO_PUBLIC_') || k.startsWith('NEXT_PUBLIC_')) && /OPERATOR/i.test(k)) {
      fail(`Public variable ${k} looks like an operator secret`, 'The console asks for the operator token at runtime; delete this variable.');
    }
  }
  try {
    const out = execFileSync('git', ['grep', '-l', '-F', '--', token], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const hits = out.split('\n').filter(Boolean);
    if (hits.length) fail(`OPERATOR_TOKEN found in committed files: ${hits.join(', ')}`, 'Remove it, rotate the token, and keep it only in apps/api/.env (gitignored).');
    else ok.push('OPERATOR_TOKEN not found in tracked files');
  } catch (e) {
    if (e.status === 1) ok.push('OPERATOR_TOKEN not found in tracked files');
    else warn('Could not run git grep to scan for the token', 'Run preflight inside the git checkout.');
  }
}

// 3. CORS includes the console origin
const consoleOrigin = (() => {
  try {
    return new URL(env.PUBLIC_SITE_URL || 'http://localhost:3000').origin;
  } catch {
    return 'http://localhost:3000';
  }
})();
if (isSet('CORS_ORIGINS')) {
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, ''));
  if (!origins.includes(consoleOrigin)) fail(`CORS_ORIGINS does not include the console origin ${consoleOrigin}`, `Add ${consoleOrigin} to CORS_ORIGINS in apps/api/.env.`);
  else ok.push(`CORS_ORIGINS includes ${consoleOrigin}`);
}

// 4. Database with PostGIS
if (!offline && isSet('DATABASE_URL')) {
  try {
    const require = createRequire(join(root, 'apps/api/package.json'));
    const postgres = require('postgres');
    const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      const [row] = await sql`SELECT postgis_lib_version() AS v`;
      ok.push(`database reachable, PostGIS ${row.v}`);
    } catch (e) {
      if (/postgis_lib_version/.test(String(e.message))) fail('Database reachable but PostGIS is not enabled', 'Run pnpm --filter api db:migrate (it runs CREATE EXTENSION postgis), or use the postgis/postgis image.');
      else fail(`Database not reachable: ${e.message}`, 'Start it: docker compose -f infra/docker-compose.yml up -d db (or a local Postgres with PostGIS) and check DATABASE_URL.');
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch (e) {
    warn(`Skipped database check: ${e.message}`, 'Run pnpm install first.');
  }
}

// 5. API health
const apiBase = env.API_BASE_URL || env.NEXT_PUBLIC_API_URL || env.EXPO_PUBLIC_API_URL;
if (!offline && apiBase) {
  try {
    const res = await fetch(new URL('/health', apiBase), { signal: AbortSignal.timeout(5000), headers: { Origin: consoleOrigin } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) fail(`API health at ${apiBase}/health returned ${res.status} ${JSON.stringify(body)}`, 'Check the API logs (pnpm --filter api dev) and the database.');
    else ok.push(`API healthy at ${apiBase} (graph ${body.graphVersion ?? 'unknown'}, PostGIS ${body.postgis ?? '?'})`);
    const allow = res.headers.get('access-control-allow-origin');
    if (allow && allow !== consoleOrigin && allow !== '*') warn(`API answered CORS for ${allow}, not ${consoleOrigin}`, 'Check CORS_ORIGINS on the API.');
  } catch (e) {
    fail(`API not reachable at ${apiBase}: ${e.cause?.code ?? e.message}`, 'Start it with pnpm --filter api dev (or docker compose -f infra/docker-compose.yml up -d) and check the URL.');
  }
}

// 6. Android signing SHA-1 for the Google Maps key
const keystores = [join(root, 'apps/mobile/android/app/debug.keystore'), join(homedir(), '.android/debug.keystore')];
let printed = false;
for (const ks of keystores) {
  if (!existsSync(ks)) continue;
  try {
    const out = execFileSync('keytool', ['-list', '-v', '-keystore', ks, '-alias', 'androiddebugkey', '-storepass', 'android', '-keypass', 'android'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const sha1 = /SHA1:\s*([0-9A-F:]+)/i.exec(out)?.[1];
    if (sha1) {
      ok.push(`debug keystore ${ks} SHA-1 ${sha1}: add it with package app.vighnaway to the Android key`);
      printed = true;
    }
  } catch {
    warn(`Could not read ${ks} with keytool`, 'Install a JDK (keytool) to print the SHA-1.');
  }
}
if (!printed) {
  warn('No Android debug keystore found to print a SHA-1', 'After the first `npx expo run:android`, re-run preflight. For EAS builds run `npx eas-cli@latest credentials` and add each build profile\'s SHA-1 (development, preview, release) to the key.');
}

// 7. Graph data
try {
  const graph = JSON.parse(readFileSync(join(root, 'packages/scenario-data/andheri/graph.json'), 'utf8'));
  if (graph.source !== 'osm') warn(`graph.json is the ${graph.source} (${graph.graphVersion}), not an OpenStreetMap extract`, 'Run scripts/extract_graph.py with network access, then re-tune the scenario (pnpm --filter @vighnaway/scenario-data tune).');
  else ok.push(`graph.json is an OSM extract (${graph.graphVersion})`);
} catch (e) {
  fail(`graph.json unreadable: ${e.message}`, 'Run pnpm graph:fixture or scripts/extract_graph.py.');
}

const print = (label, list) => {
  for (const item of list) {
    console.log(`${label} ${item.msg ?? item}`);
    if (item.fix) console.log(`      fix: ${item.fix}`);
  }
};
print('  ok  ', ok);
print(' warn ', warnings);
print(' FAIL ', failures);
const failed = failures.length > 0 || (strict && warnings.length > 0);
console.log(`\npreflight: ${failures.length} failed, ${warnings.length} warnings, ${ok.length} ok${failed ? '' : ' — ready'}`);
process.exit(failed ? 1 : 0);
