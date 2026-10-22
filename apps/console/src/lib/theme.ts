import { colors, consoleBrand, consoleChrome, consoleThemes as themes, elevation, fontFamily, letterSpacing, marker, motion, radius, spacing, type as typeScale, type ThemeName } from '@vighnaway/tokens';

/**
 * CSS custom properties generated from @vighnaway/tokens at runtime, using the same names as the
 * tokens package's dist/tokens.css (--vw-*), so the console works without building packages.
 * globals.css maps these onto the Tailwind theme; components never contain colour literals.
 */
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** cubic-bezier() from a token's control points. */
export const cubicBezier = (p: readonly number[]): string => `cubic-bezier(${p.join(', ')})`;

export const THEME_NAMES: readonly ThemeName[] = ['light', 'dark'];
export const DEFAULT_THEME: ThemeName = 'light';

/** CSS custom properties for one theme's colours (every key of themes[name]). */
export function themeCssVariables(name: ThemeName): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(themes[name])) vars[`--vw-${kebab(k)}`] = v;
  return vars;
}

/** The CSS variable that carries a given v2 colour value in every theme (e.g. a route style colour). */
const V2_VALUE_TO_KEY = new Map(Object.entries(colors).map(([k, v]) => [v as string, k] as const));
export function themeVar(value: string): string {
  const key = V2_VALUE_TO_KEY.get(value);
  return key && key in themes.light ? `var(--vw-${kebab(key)})` : value;
}
/** The concrete colour for a v2 colour value in a theme (Google polylines need real colours). */
export function themeColor(value: string, name: ThemeName): string {
  const key = V2_VALUE_TO_KEY.get(value) as keyof (typeof themes)['light'] | undefined;
  return key && key in themes[name] ? themes[name][key] : value;
}

/** Larger text (DESIGN_VISION section 3): every type size and line height scaled, layouts reflow. */
export const LARGE_TEXT_SCALE = 1.15;
export function largeTextCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(typeScale)) {
    vars[`--vw-text-${kebab(k)}`] = `${Math.round(v.size * LARGE_TEXT_SCALE)}px`;
    vars[`--vw-leading-${kebab(k)}`] = `${Math.round(v.lineHeight * LARGE_TEXT_SCALE)}px`;
  }
  return vars;
}

/** Non-colour tokens plus the default (light) theme's colours. */
export function tokenCssVariables(): Record<string, string> {
  const vars: Record<string, string> = { ...themeCssVariables(DEFAULT_THEME) };
  for (const [k, v] of Object.entries(spacing)) vars[`--vw-space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--vw-radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(typeScale)) {
    vars[`--vw-text-${kebab(k)}`] = `${v.size}px`;
    vars[`--vw-leading-${kebab(k)}`] = `${v.lineHeight}px`;
    vars[`--vw-weight-${kebab(k)}`] = v.weight;
  }
  for (const [k, v] of Object.entries(letterSpacing)) vars[`--vw-tracking-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(elevation.web)) vars[`--vw-elevation-${kebab(k)}`] = v;
  // Devanagari (Hindi, Marathi) falls back to Noto Sans Devanagari, bundled locally.
  vars['--vw-font-web'] = fontFamily.web.replace("'Inter Variable',", "'Inter Variable', 'Noto Sans Devanagari Variable',");
  vars['--vw-font-web-mono'] = fontFamily.webMono;
  for (const [k, v] of Object.entries(consoleChrome)) vars[`--vw-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(consoleBrand)) vars[`--vw-${kebab(k)}`] = v;
  vars['--vw-marker-size'] = `${marker.size}px`;
  vars['--vw-marker-glyph'] = `${marker.glyphSize}px`;
  vars['--vw-marker-ring'] = `${marker.ringWidth}px`;
  vars['--vw-marker-selected-scale'] = String(marker.selectedScale);
  vars['--vw-age-pill-height'] = `${marker.agePillHeight}px`;
  for (const [k, v] of Object.entries(motion)) {
    if (typeof v === 'number') vars[`--vw-motion-${kebab(k)}`] = k.toLowerCase().includes('scale') || k === 'noViableMapDim' ? String(v) : `${v}ms`;
  }
  vars['--vw-ease-out'] = cubicBezier(motion.easeOut);
  vars['--vw-ease-in-out'] = cubicBezier(motion.easeInOut);
  return vars;
}

const block = (selector: string, vars: Record<string, string>) =>
  `${selector} {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}\n`;

/**
 * :root carries the non-colour tokens and the light theme; [data-theme] on <html> selects a
 * theme (DESIGN.md section 12). Static CSS from the tokens package, never user text.
 */
export function tokenCss(): string {
  return [
    block(':root', tokenCssVariables()),
    ...THEME_NAMES.map((n) => block(`:root[data-theme='${n}']`, { ...themeCssVariables(n), 'color-scheme': n })),
    block(":root[data-text='large']", largeTextCssVariables()),
  ].join('');
}
