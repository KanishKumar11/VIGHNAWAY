import { Platform, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import {
  fontFamily,
  phoneBrand,
  phoneElevation as elevation,
  phoneGoogleMapStyles as googleMapStyles,
  phoneRadius as radius,
  layout,
  letterSpacing,
  marker,
  motion,
  routeStyles,
  spacing,
  phoneThemes as themes,
  type,
  zIndex,
  type PhoneBrand,
  type RouteStyleKey,
  type ThemeColors,
  type ThemeName,
  type TypeToken,
} from '@vighnaway/tokens';
import type { IncidentStatus } from '@vighnaway/contracts';
import { useSettings } from '@/stores/settings';

export { fontFamily, googleMapStyles, layout, letterSpacing, marker, motion, radius, routeStyles, spacing, themes, type, zIndex };
export type { PhoneBrand, RouteStyleKey, ThemeColors, ThemeName };

// ---------------------------------------------------------------------------------------------
// Themes (DESIGN.md 12): light and dark share keys; the phone follows the system by default.

/** The active theme: the Appearance setting, or the system scheme when it is "system". */
export function useThemeName(): ThemeName {
  const appearance = useSettings((s) => s.appearance);
  const system = useColorScheme();
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

/** Colours of the active theme. */
export function useColors(): ThemeColors {
  return themes[useThemeName()];
}

/** The premium layer for the active theme: brand and hero gradients, aurora glows, glass, shadow tint. */
export function useBrand(): PhoneBrand {
  return phoneBrand[useThemeName()];
}

export function useTheme() {
  const name = useThemeName();
  return { name, dark: name === 'dark', colors: themes[name], mapStyle: googleMapStyles[name] };
}

/**
 * Theme-aware StyleSheet: `factory` runs once per theme and the result is cached, so components
 * get stable style objects and only re-style when the theme changes.
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createStyles<T extends NamedStyles<T> | NamedStyles<any>>(factory: (tc: ThemeColors, name: ThemeName) => T | NamedStyles<T>): () => T {
  const cache: Partial<Record<ThemeName, T>> = {};
  return function useStyles(): T {
    const name = useThemeName();
    let s = cache[name];
    if (!s) {
      s = StyleSheet.create(factory(themes[name], name) as T);
      cache[name] = s;
    }
    return s;
  };
}

/** A token colour (hex or rgb) at a given alpha, for soft tints built from theme colours. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(color);
  if (m) {
    const [r, g, b] = m[1]!.split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Route line style by role with the theme's colours (widths, dashes and opacity from tokens). */
export function lineStyle(tc: ThemeColors, key: RouteStyleKey) {
  const s = routeStyles[key];
  const color =
    key === 'recommended'
      ? tc.routeRecommended
      : key === 'travelled'
        ? tc.routeTravelled
        : key === 'blocked'
          ? tc.danger
          : key === 'floodProne'
            ? tc.floodProne
            : tc.routeMuted;
  return { ...s, color, casing: s.casing ? tc.routeRecommendedCasing : null };
}

/**
 * Status ring by the ring language (marker.ring styles): amber dashed Unverified,
 * Corroborated in the warning family (double ring), red Verified, grey Resolved and Dismissed.
 */
export function ringStyle(tc: ThemeColors, status: IncidentStatus): { style: 'dashed' | 'double' | 'solid' | 'struck'; color: string } {
  const style = marker.ring[status].style as 'dashed' | 'double' | 'solid' | 'struck';
  const color = status === 'unverified' ? tc.warn : status === 'corroborated' ? tc.corroborated : status === 'verified' ? tc.danger : tc.resolved;
  return { style, color };
}

/** Chip colours for an incident status (Surface background, Ink text). */
export function statusChip(tc: ThemeColors, status: IncidentStatus): { bg: string; fg: string } {
  if (status === 'unverified') return { bg: tc.warnSurface, fg: tc.warnInk };
  if (status === 'corroborated') return { bg: tc.corroboratedSurface, fg: tc.corroboratedInk };
  if (status === 'verified') return { bg: tc.dangerSurface, fg: tc.dangerInk };
  if (status === 'resolved') return { bg: tc.positiveSoft, fg: tc.positiveInk };
  return { bg: tc.panelSunken, fg: tc.inkMuted };
}

// ---------------------------------------------------------------------------------------------
// Type

const familyFor = (weight: string): string =>
  weight === '700' ? fontFamily.bold : weight === '600' ? fontFamily.semibold : weight === '500' ? fontFamily.medium : fontFamily.regular;

const tabular = ['tabular-nums'] as TextStyle['fontVariant'];

/** Text style for a type token. Sizes respect system font scaling (no maxFontSizeMultiplier). */
export function textStyle(token: TypeToken): TextStyle {
  const t = type[token];
  return {
    fontFamily: familyFor(t.weight),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    ...(t.tabular ? { fontVariant: tabular } : null),
  };
}

/**
 * Text variants (DESIGN_VISION section 6): Manrope throughout, hierarchy from scale, weight and
 * spacing. Numbers that change use tabular figures. Monospace (`mono`) is reserved for technical
 * information only: simulation time, identifiers, coordinates and diagnostics.
 */
export const text = {
  /** The hero ETA. */
  display: { fontFamily: fontFamily.bold, fontSize: type.display.size, lineHeight: type.display.lineHeight, fontVariant: tabular, letterSpacing: -1.6 },
  eta: { ...textStyle('eta'), letterSpacing: -1 },
  /** Large screen title (DESIGN.md 15): a step under the ETA. */
  headline: { fontFamily: fontFamily.bold, fontSize: type.eta.size, lineHeight: type.eta.lineHeight, letterSpacing: -0.9 },
  title: { ...textStyle('title'), letterSpacing: -0.25 },
  body: textStyle('body'),
  meta: textStyle('meta'),
  /** Small semibold label (section labels, states). Sentence case, never uppercase. */
  label: { fontFamily: fontFamily.semibold, fontSize: type.meta.size, lineHeight: type.meta.lineHeight },
  /** Tabular figures at meta size: ages, distances, counts. */
  num: { fontFamily: fontFamily.medium, fontSize: type.meta.size, lineHeight: type.meta.lineHeight, fontVariant: tabular },
  /** Tabular figures at title size: ETAs in comparisons. */
  figure: { fontFamily: fontFamily.semibold, fontSize: type.title.size, lineHeight: type.title.lineHeight, fontVariant: tabular },
  /** Technical only: simulation clock, identifiers, coordinates, diagnostics. */
  mono: { fontFamily: fontFamily.mono, fontSize: type.meta.size, lineHeight: type.meta.lineHeight, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

/** Noto Sans Devanagari families (Hindi, Marathi), same weights as Manrope. */
export const devanagari = {
  regular: 'NotoSansDevanagari_400Regular',
  medium: 'NotoSansDevanagari_500Medium',
  semibold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
} as const;

const toDevanagari: Record<string, string> = {
  [fontFamily.regular]: devanagari.regular,
  [fontFamily.medium]: devanagari.medium,
  [fontFamily.semibold]: devanagari.semibold,
  [fontFamily.bold]: devanagari.bold,
};

/** Manrope family → its Noto Sans Devanagari equivalent for Hindi and Marathi (mono stays). */
export const devanagariFamily = (family: string | undefined): string | undefined => (family ? toDevanagari[family] ?? family : family);

/** In-app "Larger text" multiplier, on top of the system font scale. */
export const LARGER_TEXT = 1.25;

/** Hairline used for dividers and outlines. */
export const hairline = 1;

/** Native shadows on Android/iOS; the same levels as CSS box-shadows on the web preview. Cast in deep blue. */
export function shadow(level: 'sm' | 'md' | 'lg'): ViewStyle {
  if (Platform.OS === 'web') return { boxShadow: elevation.web[level] } as ViewStyle;
  return elevation.native[level];
}

/** The same blue shadow cast upward, for a surface that rises from the bottom edge (the sheet). */
export function shadowUp(level: 'sm' | 'md' | 'lg'): ViewStyle {
  if (Platform.OS === 'web') return { boxShadow: elevation.web[level].replace(/(d+px) (d+px)/, (_m, _x, y) => `0 -${y}`) } as ViewStyle;
  const s = elevation.native[level];
  return { ...s, shadowOffset: { width: 0, height: -s.shadowOffset.height } };
}

/**
 * Light cast under a brand surface (a primary button, the selected tile): the surface's own hue,
 * not a grey shadow. `color` is an opaque brand colour; `strength` 1 is a button, 0.6 a small tile.
 */
export function glow(color: string, strength = 1): ViewStyle {
  if (Platform.OS === 'web') return { boxShadow: `0 ${Math.round(10 * strength)}px ${Math.round(24 * strength)}px -6px ${withAlpha(color, 0.55)}` } as ViewStyle;
  return { shadowColor: color, shadowOpacity: 0.45 * strength + 0.05, shadowRadius: 16 * strength, shadowOffset: { width: 0, height: 8 * strength }, elevation: Math.round(8 * strength) };
}

/** Ease-out curve from tokens, for Reanimated's Easing.bezier. */
export const easeOut = motion.easeOut as unknown as [number, number, number, number];
export const easeInOut = motion.easeInOut as unknown as [number, number, number, number];
