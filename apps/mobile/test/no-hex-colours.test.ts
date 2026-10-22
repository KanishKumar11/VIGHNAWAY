import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Colours come only from @vighnaway/tokens (DESIGN.md section 2). app.config.ts is outside app/ and src/. */
const root = join(__dirname, '..');
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [p] : [];
  });
}

describe('no hard-coded hex colours', () => {
  it.each(['app', 'src'])('%s/ contains no hex colour literals', (dir) => {
    const hits: string[] = [];
    for (const f of files(join(root, dir))) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = line.match(HEX);
        if (m) hits.push(`${relative(root, f)}:${i + 1}: ${m.join(', ')}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
