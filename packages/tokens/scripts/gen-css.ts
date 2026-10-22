// Emits dist/tokens.css (CSS custom properties) for the console from src/index.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { colors, radius, spacing } from '../src/index';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const lines = [':root {'];
for (const [k, v] of Object.entries(colors)) lines.push(`  --vw-${kebab(k)}: ${v};`);
for (const [k, v] of Object.entries(spacing)) lines.push(`  --vw-space-${k}: ${v}px;`);
for (const [k, v] of Object.entries(radius)) lines.push(`  --vw-radius-${k}: ${v}px;`);
lines.push('}');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/tokens.css', lines.join('\n') + '\n');
console.log('wrote dist/tokens.css');
