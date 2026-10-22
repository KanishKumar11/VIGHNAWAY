import { andheriGraph } from '../src/index';
const g: any = andheriGraph;
console.log('bbox', JSON.stringify(g.bbox));
let t = 0, f = 0, b = 0;
const tunnels = new Map<string, any>();
for (const e of g.edges) { if (e.tunnel) { t++; tunnels.set(e.wayId, e); } if (e.floodProne) f++; if (e.bridge) b++; }
console.log({ tunnel: t, floodProne: f, bridge: b });
for (const e of tunnels.values()) console.log('tunnel way', e.wayId, e.name, e.highway, e.geometry[0]);
const near = (lat: number, lng: number, r = 0.0015) => g.edges.filter((e: any) => e.geometry.some(([x, y]: number[]) => Math.abs(y - lat) < r && Math.abs(x - lng) < r));
const names = (arr: any[]) => [...new Set(arr.map((e) => `${e.name}|${e.highway}|br=${e.bridge}|tn=${e.tunnel}|l=${e.layer}|w=${e.wayId}`))];
console.log('SUBWAY', names(near(19.116285, 72.847065)));
console.log('GOKHALE', names(near(19.1238, 72.8483)));
console.log('JOGESHWARI ROB', names(near(19.1356, 72.8490)));
console.log('FLOOD', g.edges.filter((e: any) => e.floodProne).map((e: any) => `${e.id} ${e.name} ${e.highway} ${JSON.stringify(e.geometry[0])}`));
