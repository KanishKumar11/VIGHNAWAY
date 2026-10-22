import { andheriGraph } from '../src/index';
import { loadGraph, snapToEdge } from '@vighnaway/engine';
const raw = loadGraph(andheriGraph, 'foot');
let found = 0;
for (let lat = 19.105; lat < 19.14 && found < 5; lat += 0.0017)
  for (let lng = 72.83; lng < 72.88 && found < 5; lng += 0.0017) {
    const s = snapToEdge(raw, { lat, lng });
    if (s && s.distanceM > 120) { console.log(lat.toFixed(5), lng.toFixed(5), Math.round(s.distanceM)); found++; }
  }
