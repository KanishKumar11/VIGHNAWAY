#!/usr/bin/env node
// pnpm smoke: drives a RUNNING API through the scripted demo and the audience flow, with REST only (no browser).
// It is the drill for docs/demo-script.md and the API half of the judge-in-the-loop end-to-end (P1-3.d).
//
//   OPERATOR_TOKEN=... API_URL=http://localhost:4000 node scripts/smoke-demo.mjs
//
// It RESETS the simulated scenario (andheri-monsoon): do not run it during a live demo. Exit code 1 on any failed check.
// Not run in the build sandbox (no Postgres there): run it after deploying and after `db:migrate` and `db:seed`.

const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TOKEN = process.env.OPERATOR_TOKEN || '';
const SID = process.env.SCENARIO_ID || 'andheri-monsoon';

if (!TOKEN) {
  console.error('Set OPERATOR_TOKEN (the server-side operator token). It is never printed.');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
};

async function call(method, path, body, auth = false) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}
const get = (p) => call('GET', p);
const post = (p, b = {}, auth = false) => call('POST', p, b, auth);
const sim = (action) => post(`/scenarios/${SID}/sim/${action}`, {}, true);
const incidents = async () => (await get(`/scenarios/${SID}/incidents`)).json;

// Points from the scripted scenario (packages/scenario-data/andheri/scenario.json).
let scenario = null;
try {
  scenario = (await get(`/scenarios/${SID}`)).json?.scenario;
} catch (e) {
  console.error(`Could not reach ${API}: ${e.cause?.code || e.message}`);
  process.exit(2);
}
if (!scenario) {
  console.error(`Could not read scenario ${SID} from ${API}. Is the API up and seeded?`);
  process.exit(2);
}
const ev = (id) => scenario.events.find((e) => e.id === id);
const subway = ev('ev01-ankle').report.point;
const hospitalRoad = ev('ev06-closure').report.point;

const health = (await get('/health')).json;
check('health is ok and names the graph the scenario expects', health?.ok && health.graphVersion === scenario.graphVersion, `${health?.graphVersion} vs ${scenario.graphVersion}`);

// 1. The scripted run, one event at a time.
async function scriptedRun() {
  let r = await sim('reset');
  if (r.status !== 200) throw new Error(`reset failed: ${r.status}`);
  const snapshots = {};
  for (const e of scenario.events) {
    const s = await sim('step');
    if (s.status !== 200) throw new Error(`step failed at ${e.id}: ${s.status}`);
    const snap = await incidents();
    snapshots[e.id] = snap.incidents.map((i) => ({ type: i.type, status: i.status, deviceCount: i.deviceCount, verifiedBy: i.verifiedBy, depth: i.depth, roadName: i.roadName, audienceOnly: !!i.audienceOnly }));
  }
  const hist = (await get(`/scenarios/${SID}/history`)).json;
  return { snapshots, hist };
}

const first = await scriptedRun();
const flood = (id) => first.snapshots[id].find((i) => i.type === 'flood');
check('ev01: one Unverified flood on the Andheri Subway', flood('ev01-ankle')?.status === 'unverified' && flood('ev01-ankle')?.roadName === 'Andheri Subway', JSON.stringify(flood('ev01-ankle')));
check('ev02: the second device makes it Corroborated (2 devices), knee deep', flood('ev02-knee')?.status === 'corroborated' && flood('ev02-knee')?.deviceCount === 2 && flood('ev02-knee')?.depth === 'knee');
check('ev03: Verified by the simulated operator, nobody else', flood('ev03-verify')?.status === 'verified' && flood('ev03-verify')?.verifiedBy === 'simulated_operator');
const jam = (id) => first.snapshots[id].find((i) => i.type === 'congestion');
check('ev04/ev05: congestion Unverified, then Corroborated', jam('ev04-congestion-a')?.status === 'unverified' && jam('ev05-congestion-b')?.status === 'corroborated');
const closure = first.snapshots['ev07-verify-closure'].find((i) => i.type === 'closure');
check('ev06/ev07: the hospital road closure ends Verified', closure?.status === 'verified');
const seqs = first.hist.entries.map((e) => e.seq);
check('history is complete and ordered by seq', first.hist.entries.length >= scenario.events.length && seqs.every((s, i) => i === 0 || s > seqs[i - 1]), `${seqs.length} entries`);

// 2. Reset then replay gives the same incident outcomes (determinism).
const second = await scriptedRun();
check('reset then replay gives identical incident outcomes', JSON.stringify(first.snapshots) === JSON.stringify(second.snapshots));

// 3. Audience flow (P1-3): two phones, Corroborated by a heuristic, never Verified; clear on request.
await sim('reset');
const rep = (deviceId, origin, point = subway, type = 'flood') =>
  post(`/scenarios/${SID}/reports`, { type, ...(type === 'flood' ? { depth: 'ankle' } : {}), point, observedPersonally: true, deviceId, origin });
const a1 = await rep('smoke-audience-1', 'audience');
const a2 = await rep('smoke-audience-2', 'audience');
check('two audience phones: created, then Corroborated', a1.status === 201 && a2.status === 201 && a2.json?.incident?.status === 'corroborated');
check('an audience-only incident is tagged, and is never Verified', a2.json?.incident?.audienceOnly === true && a2.json?.incident?.status !== 'verified');
const unauth = await post(`/scenarios/${SID}/audience/clear`, {}, false);
check('clearing audience reports needs the operator token', unauth.status === 401 || unauth.status === 403, `status ${unauth.status}`);
const cleared = await post(`/scenarios/${SID}/audience/clear`, {}, true);
check('operator clear dismisses the audience-only incident', cleared.status === 200 && cleared.json?.cleared >= 1, JSON.stringify(cleared.json));
const afterClear = await incidents();
check('the cleared incident is no longer open', !afterClear.incidents.some((i) => i.audienceOnly && ['unverified', 'corroborated', 'verified'].includes(i.status)));

// 4. An app report joining an audience incident makes it a normal one, which clear leaves alone.
await sim('reset');
await rep('smoke-audience-1', 'audience', hospitalRoad, 'closure');
const joined = await rep('smoke-app-1', 'app', hospitalRoad, 'closure');
check('a non-audience report on the same incident clears its audience-only tag', !joined.json?.incident?.audienceOnly, JSON.stringify(joined.json?.incident?.audienceOnly));
const keep = await post(`/scenarios/${SID}/audience/clear`, {}, true);
check('clear leaves a mixed incident alone', keep.status === 200 && keep.json?.cleared === 0, JSON.stringify(keep.json));

// 5. Ask the crowd (P1-4): one prompt answer per road per device, and a No never resolves anything.
await sim('reset');
const p1 = await rep('smoke-prompt-1', 'prompt');
const p2 = await rep('smoke-prompt-1', 'prompt');
check('a second prompt answer for the same road from the same device is refused (409)', p1.status === 201 && p2.status === 409, `${p1.status} then ${p2.status}`);
await rep('smoke-flood-2', 'app');
const no = await post(`/scenarios/${SID}/reports`, { type: 'road_clear', point: subway, observedPersonally: false, deviceId: 'smoke-prompt-2', origin: 'prompt' });
const stillOpen = (await incidents()).incidents.some((i) => i.type === 'flood' && ['unverified', 'corroborated'].includes(i.status));
check('a prompt "Road clear" never resolves an incident', no.status === 201 && stillOpen);
const obs = (await incidents()).observations;
check('observations list the flood-prone road, Road clear included', Array.isArray(obs) && obs.length > 0, JSON.stringify(obs)?.slice(0, 120));

// 6. Leave the scenario clean.
await sim('reset');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
