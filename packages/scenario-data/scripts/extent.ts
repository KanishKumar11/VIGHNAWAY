import { andheriGraph } from '../src/index';
import { loadGraph, snapToEdge } from '@vighnaway/engine';
const raw = loadGraph(andheriGraph, 'foot');
function extent(point: { lat: number; lng: number }, type: string) {
  const snap = snapToEdge(raw, point);
  if (!snap || snap.distanceM > 30) return null;
  const e = raw.edges[raw.edgeIndex.get(snap.edgeId)!]!;
  const radius = type === 'congestion' ? 600 : 60;
  const ids = new Set<string>([e.baseId]);
  if (e.reverseIdx >= 0) ids.add(raw.edges[e.reverseIdx]!.baseId);
  if (e.name) for (const other of raw.edges) { if (other.virtual || other.name !== e.name) continue; const s = snapToEdge(raw, point, [other.id]); if (s && s.distanceM <= radius) ids.add(other.baseId); }
  return { snapped: e.baseId, name: e.name, edgeIds: [...ids].sort() };
}
for (const [label, p, t] of [
  ['SUBWAY', { lat: 19.12379, lng: 72.85037 }, 'flood'],
  ['FLYOVER', { lat: 19.11463, lng: 72.85175 }, 'congestion'],
  ['HOSPITAL', { lat: 19.1249081, lng: 72.8669246 }, 'closure'],
] as const) console.log(label, JSON.stringify(extent(p, t)));
