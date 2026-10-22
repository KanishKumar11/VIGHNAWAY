import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, consoleThemes as themes, radius, spacing } from '@vighnaway/tokens';
import { themeColor, themeCssVariables, themeVar, tokenCss, tokenCssVariables } from '@/lib/theme';
import { resolveTheme, themeBootScript } from '@/lib/themeMode';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe('design tokens only', () => {
  it('has no hex colour literals in src/ (colours come from @vighnaway/tokens)', () => {
    const offenders: string[] = [];
    for (const f of files(SRC)) {
      const text = readFileSync(f, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/&#\d+;/.test(line)) offenders.push(`${relative(SRC, f)}:${i + 1}: ${line.trim()}`);
        if (/\brgba?\(\s*\d/.test(line) || /\bhsla?\(\s*\d/.test(line)) offenders.push(`${relative(SRC, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('does not use Tailwind palette colours or arbitrary colour values', () => {
    const palette = /\b(?:bg|text|border|fill|stroke|ring|outline|decoration|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black)-\d{2,3}\b/;
    const arbitrary = /\b(?:bg|text|border|fill|stroke)-\[(?:#|rgb|hsl)/;
    const offenders = files(SRC).filter((f) => {
      const t = readFileSync(f, 'utf8');
      return palette.test(t) || arbitrary.test(t);
    });
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('generates CSS variables for every key of both themes, and themes switch with [data-theme]', () => {
    const kebab = (k: string) => `--vw-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    for (const name of ['light', 'dark'] as const) {
      const vars = themeCssVariables(name);
      expect(Object.keys(vars).sort()).toEqual(Object.keys(themes[name]).map(kebab).sort());
      for (const [k, v] of Object.entries(themes[name])) expect(vars[kebab(k)], `${name}.${k}`).toBe(v);
    }
    // Every v2 colour name the console still references exists in both themes.
    for (const k of Object.keys(colors)) expect(k in themes.light && k in themes.dark, k).toBe(true);
    const css = tokenCss();
    expect(css).toContain(":root[data-theme='light']");
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain(`--vw-accent: ${themes.dark.accent};`);
    // Route colours resolve through the theme: the same scene renders in both themes.
    expect(themeVar(colors.routeRecommended)).toBe('var(--vw-route-recommended)');
    expect(themeColor(colors.routeRecommended, 'light')).toBe(themes.light.routeRecommended);
    expect(themeColor(colors.routeRecommended, 'dark')).toBe(themes.dark.routeRecommended);
  });

  it('picks the page default theme without a flash rule: stored choice, else light, /report follows the system', () => {
    expect(resolveTheme('dark', '/console', false)).toBe('dark');
    expect(resolveTheme(null, '/console', true)).toBe('light');
    expect(resolveTheme(null, '/report', true)).toBe('dark');
    expect(resolveTheme('bogus', '/report', false)).toBe('light');
    expect(themeBootScript).toContain('vighnaway.theme');
    // Nothing React would escape inside <script> text.
    expect(themeBootScript).not.toMatch(/[<>&"']/);
    // The boot script and resolveTheme agree.
    const run = (stored: string | null, path: string, dark: boolean) => {
      const html = { dataset: {} as Record<string, string> };
      const fn = new Function('localStorage', 'window', 'location', 'document', themeBootScript);
      fn({ getItem: () => stored }, { matchMedia: () => ({ matches: dark }) }, { pathname: path }, { documentElement: html });
      return html.dataset.theme;
    };
    for (const stored of [null, 'light', 'dark', 'bogus'])
      for (const path of ['/console', '/report', '/rules'])
        for (const dark of [false, true]) expect(run(stored, path, dark), `${stored} ${path} ${dark}`).toBe(resolveTheme(stored, path, dark));
  });

  it('generates a CSS variable for every spacing and radius token', () => {
    const vars = tokenCssVariables();
    for (const [k, v] of Object.entries(spacing)) expect(vars[`--vw-space-${k}`]).toBe(`${v}px`);
    for (const [k, v] of Object.entries(radius)) expect(vars[`--vw-radius-${k}`]).toBe(`${v}px`);
    expect(vars['--vw-text-console-base']).toBe('18px');
    expect(tokenCss().startsWith(':root {')).toBe(true);
  });

  it('maps every Tailwind colour in globals.css to a --vw-* token variable', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    const defs = [...css.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)].filter(([, name]) => name !== '*');
    expect(defs.length).toBeGreaterThan(10);
    const vars = tokenCssVariables();
    for (const [, name, value] of defs) {
      if (['transparent', 'current'].includes(name!)) continue;
      const m = /^var\((--vw-[a-z-]+)\)$/.exec(value!.trim());
      expect(m, `--color-${name}`).not.toBeNull();
      expect(vars[m![1]!], m![1]).toBeDefined();
    }
  });
});
