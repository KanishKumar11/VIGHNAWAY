// TEMPORARY dev tool (not committed): a tiny stand-in for the API so the console can be screenshotted without Postgres.
import { createServer } from 'node:http';
import type { Incident } from '@vighnaway/contracts';
import { loadGraph, snapToEdge } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '../src/index';

const raw = loadGraph(andheriGraph, 'foot');
function extent(point: { lat: number; lng: number }, type: string) {
  const snap = snapToEdge(raw, point)!;
  const e = raw.edges[raw.edgeIndex.get(snap.edgeId)!]!;
  const radius = type === 'congestion' ? 600 : 60;
  const ids = new Set<string>([e.baseId]);
  if (e.reverseIdx >= 0) ids.add(raw.edges[e.reverseIdx]!.baseId);
  if (e.name) for (const o of raw.edges) { if (o.virtual || o.name !== e.name) continue; const s = snapToEdge(raw, point, [o.id]); if (s && s.distanceM <= radius) ids.add(o.baseId); }
  return { edgeIds: [...ids].sort(), road: e.name };
}
const ev = (id: string) => (andheriScenario.events.find((e) => e.id === id) as { report: { point: { lat: number; lng: number } } }).report.point;

function inc(over: Partial<Incident> & Pick<Incident, 'id' | 'type'>, point: { lat: number; lng: number }, atS: number, seq: number): Incident {
  const x = extent(point, over.type);
  return {
    scenarioId: andheriScenario.id, status: 'unverified', source: 'simulated', depth: null, congestion: null, severity: null, impassable: false, conflicting: false,
    edgeIds: x.edgeIds, point, roadName: x.road, reportCount: 1, deviceCount: 1, createdAtS: atS, lastReportAtS: atS, updatedAtS: atS, verifiedAtS: null, verifiedBy: null,
    closedAtS: null, linkedIncidentId: null, note: null, seq, ...over,
  } as Incident;
}
const ankle = inc({ id: 'inc-flood', type: 'flood', depth: 'ankle' }, ev('ev01-ankle'), 60, 1);
const knee: Incident = { ...ankle, depth: 'knee', status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 180, updatedAtS: 180, seq: 2 };
const verified: Incident = { ...knee, status: 'verified', verifiedAtS: 270, verifiedBy: 'simulated_operator', updatedAtS: 270, seq: 3 };
const jam = inc({ id: 'inc-jam', type: 'congestion', congestion: 'heavy' }, ev('ev04-congestion-a'), 360, 4);
const jamC: Incident = { ...jam, status: 'corroborated', deviceCount: 2, reportCount: 2, lastReportAtS: 370, updatedAtS: 370, seq: 5 };
const entries = [
  { seq: 1, atS: 60, kind: 'created_incident', summary: 'Flooding (ankle deep) at Andheri Subway reported: Unverified (Simulated)', incident: ankle },
  { seq: 2, atS: 180, kind: 'attached', summary: 'Flooding (knee deep) at Andheri Subway marked Corroborated (2 devices) · Simulated', incident: knee },
  { seq: 3, atS: 270, kind: 'verified', summary: 'Flooding (knee deep) at Andheri Subway verified by simulated operator', incident: verified },
  { seq: 4, atS: 360, kind: 'created_incident', summary: 'Heavy congestion on G K Gokhale Flyover reported: Unverified (Simulated)', incident: jam },
  { seq: 5, atS: 370, kind: 'attached', summary: 'Heavy congestion on G K Gokhale Flyover marked Corroborated (2 devices) · Simulated', incident: jamC },
];
const NOW = 520;
const sim = { scenarioId: andheriScenario.id, runId: 'run-mock', state: 'paused', simTimeS: NOW, nextEventIndex: 5, eventCount: andheriScenario.events.length, simSecondsPerRealSecond: 10, seq: 5 };
const current = [verified, jamC];

const json = (res: import('node:http').ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
  res.end(JSON.stringify(body));
};
createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (p === '/health') return json(res, 200, { ok: true, db: true, postgis: '3.4', graphVersion: andheriGraph.graphVersion, version: 'mock' });
  if (p === '/scenarios') return json(res, 200, { scenarios: [{ id: andheriScenario.id, name: andheriScenario.name, area: andheriScenario.area, mode: 'simulated', simulated: true, graphVersion: andheriScenario.graphVersion }] });
  if (p === `/scenarios/${andheriScenario.id}`) return json(res, 200, { scenario: andheriScenario, sim });
  if (p === `/scenarios/${andheriScenario.id}/sim`) return json(res, 200, { sim });
  if (p === `/scenarios/${andheriScenario.id}/history`) return json(res, 200, { scenarioId: andheriScenario.id, runId: 'run-mock', resetSeq: 0, entries });
  if (p === `/scenarios/${andheriScenario.id}/incidents`) return json(res, 200, { scenarioId: andheriScenario.id, seq: 5, full: true, runId: 'run-mock', simTimeS: NOW, incidents: current, observations: [] });
  return json(res, 404, { error: { code: 'NOT_FOUND', message: 'mock' } });
}).listen(4000, () => console.log('mock api on :4000'));
