// P2-9.a: how much of the mapped Andheri road network says whether it is lit (OpenStreetMap `lit`).
// Reads the cached Overpass extract (the largest JSON in cache/), or a path given as the first argument.
// Run: node scripts/lit_coverage.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', 'cache');
const file = process.argv[2] ?? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
const ways = JSON.parse(readFileSync(file, 'utf8')).elements.filter((e) => e.type === 'way' && e.tags?.highway);
const WALKABLE = new Set(['footway', 'path', 'pedestrian', 'steps', 'residential', 'living_street', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'track', 'corridor']);
const walk = ways.filter((w) => WALKABLE.has(w.tags.highway));
const count = (list) => {
  const c = { yes: 0, no: 0, other: 0, unknown: 0 };
  for (const w of list) {
    const v = w.tags.lit;
    if (v === undefined) c.unknown++;
    else if (v === 'yes') c.yes++;
    else if (v === 'no') c.no++;
    else c.other++;
  }
  return c;
};
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const all = count(walk);
console.log(`file: ${path.basename(file)}`);
console.log(`ways with a highway tag: ${ways.length}; walkable: ${walk.length}`);
console.log(`lit=yes ${all.yes} (${pct(all.yes, walk.length)}), lit=no ${all.no} (${pct(all.no, walk.length)}), other values ${all.other}, not mapped ${all.unknown} (${pct(all.unknown, walk.length)})`);
const byClass = {};
for (const w of walk) (byClass[w.tags.highway] ??= []).push(w);
for (const [k, list] of Object.entries(byClass).sort((a, b) => b[1].length - a[1].length)) {
  const c = count(list);
  console.log(`  ${k.padEnd(14)} ${String(list.length).padStart(5)} ways, lit mapped on ${pct(c.yes + c.no + c.other, list.length)}`);
}
