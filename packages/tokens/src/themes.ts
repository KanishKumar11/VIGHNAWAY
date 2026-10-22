/**
 * v3 colour system (DESIGN.md section 12): two complete themes with identical keys, so every
 * surface switches by swapping one object (native) or one set of CSS variables (web).
 *
 * Every text/background pair the UI uses is checked against WCAG 2.2 AA by test/contrast.test.ts
 * (4.5:1 for text, 3:1 for routes, markers and other meaningful graphics). Change a value only
 * with that test green.
 */

// Values from docs/DESIGN_VISION.md sections 4.1–4.3 (product owner's palette). Keys not named
// there (map field, roads, hairlines, flood-prone underlay) are derived from its neutrals and
// covered by the contrast tests. No extra accent hues: Corroborated uses the warning treatment
// and Live data a neutral one; both are told apart by ring style and an explicit label.

const dark = {
  // Page, map field and floating surfaces
  shell: '#0B1426',
  shellDeep: '#0B1426',
  shellRaised: '#111C33',
  shellOverlay: '#17243D',
  shellLine: '#233250',
  shellHairline: 'rgba(148, 163, 184, 0.16)',
  shellHairlineStrong: 'rgba(100, 116, 139, 0.6)',
  shellHighlight: 'rgba(255, 255, 255, 0.05)',
  // Cards and sheets
  panel: '#111C33',
  panelRaised: '#17243D',
  panelDark: '#111C33',
  panelLine: '#233250',
  panelSunken: '#0E182D',
  panelHairline: 'rgba(148, 163, 184, 0.16)',
  // Text
  ink: '#F8FAFC',
  inkMuted: '#CBD5E1',
  inkSubtle: '#94A3B8',
  inkOnShell: '#F8FAFC',
  inkOnShellMuted: '#CBD5E1',
  // Primary action, focus, control boundaries
  accent: '#14B8A6',
  onAccent: '#0B1426',
  accentInk: '#5EEAD4',
  brand: '#2DD4BF',
  brandAlt: '#2DD4BF',
  focus: '#2DD4BF',
  controlBorder: '#64748B',
  // Routes
  routeRecommended: '#2DD4BF',
  routeRecommendedCasing: '#0B1426',
  routeTravelled: '#0F766E',
  routeMuted: '#94A3B8',
  tealSoft: '#042F2E',
  tealGlow: 'rgba(45, 212, 191, 0.25)',
  // States (4.3): Recommended, Warning, Critical, Resolved
  recommendedSurface: '#042F2E',
  recommendedInk: '#5EEAD4',
  warn: '#FBBF24',
  warnInk: '#FBBF24',
  warnSurface: '#422006',
  warnSoft: 'rgba(251, 191, 36, 0.14)',
  corroborated: '#FBBF24',
  corroboratedInk: '#FBBF24',
  corroboratedSurface: '#422006',
  danger: '#F87171',
  dangerInk: '#FCA5A5',
  dangerSurface: '#450A0A',
  dangerSoft: 'rgba(248, 113, 113, 0.16)',
  dangerGlow: 'rgba(248, 113, 113, 0.35)',
  positive: '#4ADE80',
  positiveInk: '#4ADE80',
  positiveSoft: '#052E16',
  live: '#CBD5E1',
  liveInk: '#F8FAFC',
  liveSurface: '#17243D',
  resolved: '#94A3B8',
  // Map
  floodProne: 'rgba(56, 189, 248, 0.32)',
  floodProneSolid: '#38BDF8',
  roadMajor: '#22314F',
  roadMinor: '#18253F',
  railway: '#CBD5E1',
  scrim: 'rgba(3, 7, 18, 0.62)',
  white: '#FFFFFF',
} as const;

export type ThemeColors = { [K in keyof typeof dark]: string };

const light: ThemeColors = {
  shell: '#F7F5F0',
  shellDeep: '#EFECE5',
  shellRaised: '#FFFFFF',
  shellOverlay: '#FFFFFF',
  shellLine: '#E4E1D9',
  shellHairline: 'rgba(15, 23, 42, 0.08)',
  shellHairlineStrong: 'rgba(100, 116, 139, 0.55)',
  shellHighlight: 'rgba(255, 255, 255, 0.9)',
  panel: '#FFFFFF',
  panelRaised: '#FFFFFF',
  panelDark: '#111C33',
  panelLine: '#E2E8F0',
  panelSunken: '#F0F2F5',
  panelHairline: 'rgba(15, 23, 42, 0.08)',
  ink: '#0F172A',
  inkMuted: '#475569',
  inkSubtle: '#475569',
  inkOnShell: '#0F172A',
  inkOnShellMuted: '#475569',
  accent: '#0F766E',
  onAccent: '#FFFFFF',
  accentInk: '#115E59',
  brand: '#0F766E',
  brandAlt: '#0F766E',
  focus: '#0F766E',
  controlBorder: '#64748B',
  routeRecommended: '#0F766E',
  routeRecommendedCasing: '#FFFFFF',
  routeTravelled: '#134E4A',
  routeMuted: '#64748B',
  tealSoft: '#F0FDFA',
  tealGlow: 'rgba(15, 118, 110, 0.2)',
  recommendedSurface: '#F0FDFA',
  recommendedInk: '#115E59',
  warn: '#B45309',
  warnInk: '#92400E',
  warnSurface: '#FFFBEB',
  warnSoft: 'rgba(180, 83, 9, 0.10)',
  corroborated: '#B45309',
  corroboratedInk: '#92400E',
  corroboratedSurface: '#FFFBEB',
  danger: '#B91C1C',
  dangerInk: '#991B1B',
  dangerSurface: '#FEF2F2',
  dangerSoft: 'rgba(185, 28, 28, 0.10)',
  dangerGlow: 'rgba(185, 28, 28, 0.25)',
  positive: '#15803D',
  positiveInk: '#166534',
  positiveSoft: '#F0FDF4',
  live: '#475569',
  liveInk: '#0F172A',
  liveSurface: '#F0F2F5',
  resolved: '#64748B',
  floodProne: 'rgba(2, 132, 199, 0.22)',
  floodProneSolid: '#0369A1',
  roadMajor: '#D8D3C8',
  roadMinor: '#E4E0D7',
  railway: '#475569',
  scrim: 'rgba(15, 23, 42, 0.38)',
  white: '#FFFFFF',
};

export const themes = { dark: dark as ThemeColors, light } as const;
export type ThemeName = keyof typeof themes;

/**
 * Phone themes ("Monsoon Signal", docs/DESIGN_VISION.md appendix B): the first-run identity applied
 * to the whole app. Dark is the rain-dark aubergine night with a signal-lime route and primary
 * action; light is warm monsoon paper with the same lime button and a deeper olive-lime route that
 * holds 3:1 on the map. Warning, critical and resolved hues are unchanged, so hazards read the same;
 * the key names `tealSoft` / `tealGlow` are historical and now hold the lime tints. The control room
 * keeps `consoleThemes`. Same keys as every theme.
 */
const phoneLight: ThemeColors = {
  ...light,
  shell: '#F6F1E9',
  shellDeep: '#EDE5D8',
  shellRaised: '#FFFFFF',
  shellOverlay: '#FFFFFF',
  shellLine: '#E3D9C8',
  shellHairline: 'rgba(38, 18, 63, 0.10)',
  shellHairlineStrong: 'rgba(60, 40, 90, 0.5)',
  panel: '#FFFFFF',
  panelRaised: '#FBF7F0',
  panelDark: '#26123F',
  panelLine: '#E6DCCB',
  panelSunken: '#F1EADE',
  panelHairline: 'rgba(38, 18, 63, 0.10)',
  ink: '#1A1030',
  inkMuted: '#4A3F66',
  inkSubtle: '#54496F',
  inkOnShell: '#1A1030',
  inkOnShellMuted: '#4A3F66',
  accent: '#C8F560',
  onAccent: '#14102A',
  accentInk: '#3F6212',
  brand: '#4D7C0F',
  brandAlt: '#B45309',
  focus: '#3F6212',
  routeRecommended: '#4D7C0F',
  routeRecommendedCasing: '#FFFFFF',
  routeTravelled: '#365314',
  routeMuted: '#6E6288',
  tealSoft: '#EEF6D6',
  tealGlow: 'rgba(77, 124, 15, 0.28)',
  recommendedSurface: '#EEF6D6',
  recommendedInk: '#3F6212',
  warnSurface: '#FFF1CC',
  /** Raspberry rather than red: a red blocked line and an olive route merge under deuteranopia. */
  danger: '#9D174D',
  dangerSurface: '#FFE3E3',
  positiveSoft: '#D9F7E3',
  live: '#4A3F66',
  liveInk: '#1A1030',
  liveSurface: '#F1EADE',
  floodProne: 'rgba(14, 116, 144, 0.22)',
  floodProneSolid: '#0E7490',
  roadMajor: '#DDD2BF',
  roadMinor: '#E8DFD0',
  railway: '#4A3F66',
  scrim: 'rgba(26, 16, 48, 0.45)',
};

const phoneDark: ThemeColors = {
  ...dark,
  shell: '#0B0817',
  shellDeep: '#0B0817',
  shellRaised: '#150E2E',
  shellOverlay: '#1E1540',
  shellLine: '#2D2150',
  shellHairline: 'rgba(210, 201, 234, 0.14)',
  shellHairlineStrong: 'rgba(178, 168, 210, 0.6)',
  shellHighlight: 'rgba(255, 255, 255, 0.06)',
  panel: '#150E2E',
  panelRaised: '#1E1540',
  panelDark: '#150E2E',
  panelLine: '#2D2150',
  panelSunken: '#100B24',
  panelHairline: 'rgba(210, 201, 234, 0.14)',
  ink: '#FFF6E8',
  inkMuted: '#D2C9EA',
  inkSubtle: '#B2A8D2',
  inkOnShell: '#FFF6E8',
  inkOnShellMuted: '#D2C9EA',
  accent: '#C8F560',
  onAccent: '#14102A',
  accentInk: '#C8F560',
  brand: '#C8F560',
  brandAlt: '#FFB320',
  focus: '#C8F560',
  controlBorder: '#8C80B0',
  routeRecommended: '#C8F560',
  routeRecommendedCasing: '#0B0817',
  routeTravelled: '#7FA83A',
  routeMuted: '#B2A8D2',
  tealSoft: '#1E2A10',
  tealGlow: 'rgba(200, 245, 96, 0.28)',
  recommendedSurface: '#1E2A10',
  recommendedInk: '#C8F560',
  liveInk: '#FFF6E8',
  liveSurface: '#1E1540',
  floodProne: 'rgba(47, 211, 242, 0.28)',
  floodProneSolid: '#2FD3F2',
  roadMajor: '#2D2150',
  roadMinor: '#221842',
  railway: '#D2C9EA',
  scrim: 'rgba(6, 3, 16, 0.66)',
};

/** The phone's themes (the app's useTheme reads these). */
export const phoneThemes = { dark: phoneDark, light: phoneLight } as const;

/**
 * Phone premium layer (DESIGN.md section 16): solid colour only, no gradients. A deep hero surface,
 * glass for floating bars, the light a brand surface casts, and the tint every shadow is cast in.
 * The phone's themes above stay the source of every text and surface colour.
 */
export interface PhoneBrand {
  /** Deep surface for hero cards (the drawer face, the arrival card). */
  hero: string;
  onHero: string;
  onHeroMuted: string;
  /** Hairline on the hero surface. */
  heroEdge: string;
  /** Colour a brand button casts as light underneath it. */
  glow: string;
  /** Floating bars over the map: translucent card colour and its light edge. */
  glass: string;
  glassEdge: string;
  /** The hue every shadow is cast in (a deep aubergine, never grey). */
  shadowTint: string;
}

const phoneBrandLight: PhoneBrand = {
  hero: '#26123F',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255, 255, 255, 0.82)',
  heroEdge: 'rgba(255, 255, 255, 0.14)',
  glow: 'rgba(124, 181, 24, 0.45)',
  glass: 'rgba(255, 255, 255, 0.92)',
  glassEdge: 'rgba(255, 255, 255, 0.85)',
  shadowTint: '#26123F',
};

const phoneBrandDark: PhoneBrand = {
  hero: '#241049',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255, 255, 255, 0.82)',
  heroEdge: 'rgba(255, 255, 255, 0.12)',
  glow: 'rgba(200, 245, 96, 0.40)',
  glass: 'rgba(21, 14, 46, 0.9)',
  glassEdge: 'rgba(210, 201, 234, 0.2)',
  shadowTint: '#030108',
};

/** The phone's brand layer per theme. */
export const phoneBrand = { dark: phoneBrandDark, light: phoneBrandLight } as const;

/** Brand pairs on the phone, checked by test/contrast.test.ts for both themes. */
export const phoneBrandContrastPairs: { fg: keyof PhoneBrand; bg: keyof PhoneBrand; min: number; what: string }[] = [
  { fg: 'onHero', bg: 'hero', min: 4.5, what: 'text on the hero surface' },
  { fg: 'onHeroMuted', bg: 'hero', min: 4.5, what: 'muted text on the hero surface' },
];

/**
 * Phone shape and depth (DESIGN.md section 16): rounder surfaces than the console, and shadows cast
 * in a deep blue so a card lifts off the page instead of greying it. Web box-shadows and native
 * shadow props for the same levels. The console keeps `radius` and `elevation`.
 */
export const phoneRadius = { sheet: 26, card: 18, chip: 999, button: 16, marker: 18 } as const;

export const phoneElevation = {
  web: {
    sm: '0 1px 2px rgba(38, 18, 63, 0.06), 0 4px 12px -2px rgba(38, 18, 63, 0.10)',
    md: '0 2px 4px rgba(38, 18, 63, 0.06), 0 14px 30px -10px rgba(38, 18, 63, 0.26)',
    lg: '0 4px 10px rgba(38, 18, 63, 0.08), 0 28px 56px -14px rgba(38, 18, 63, 0.38)',
  },
  native: {
    sm: { shadowColor: '#26123F', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
    md: { shadowColor: '#26123F', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    lg: { shadowColor: '#26123F', shadowOpacity: 0.3, shadowRadius: 34, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
  },
} as const;

/**
 * Console light theme ("Porcelain", DESIGN.md section 13): the control room's own light palette.
 * A cool porcelain canvas with white floating panels replaces the phone's warm paper environment;
 * the status hues (recommended, warning, critical, resolved) and every contrast pair are unchanged,
 * so meaning reads the same. Keys are identical to the other themes. The phone keeps `themes.light`.
 */
const consoleLight: ThemeColors = {
  ...light,
  shell: '#EDF0F5',
  shellDeep: '#E4E9F1',
  shellRaised: '#FFFFFF',
  shellOverlay: '#FFFFFF',
  shellLine: '#E2E7EF',
  shellHairline: 'rgba(15, 23, 42, 0.07)',
  shellHairlineStrong: 'rgba(71, 85, 105, 0.45)',
  panelLine: '#E2E7EF',
  panelSunken: '#F3F5F9',
  panelHairline: 'rgba(15, 23, 42, 0.07)',
  ink: '#0B1324',
  inkSubtle: '#566176',
  inkOnShell: '#0B1324',
  accentInk: '#0B5F58',
  tealSoft: '#E7F5F3',
  tealGlow: 'rgba(15, 118, 110, 0.18)',
  recommendedSurface: '#EAF7F5',
  recommendedInk: '#0B5F58',
  warnSurface: '#FFF6E5',
  dangerSurface: '#FDEEEE',
  positiveSoft: '#EDF8F0',
  liveInk: '#0B1324',
  liveSurface: '#EEF1F6',
  floodProne: 'rgba(2, 132, 199, 0.2)',
  roadMajor: '#CBD3DF',
  roadMinor: '#DAE0E9',
  scrim: 'rgba(16, 24, 48, 0.4)',
};

/**
 * Console dark theme ("Midnight indigo"): the control room's own dark palette. The shared dark is
 * a flat slate navy whose panels barely separate from the canvas and whose teal accent clashes with
 * the indigo brand. This one tints every neutral toward the brand indigo, steps the canvas, panel
 * and overlay surfaces apart so the three floating panels read as layers, and softens the status
 * surfaces from muddy brown/maroon to deep amber/rose. Status hues and routes are unchanged.
 */
const consoleDark: ThemeColors = {
  ...dark,
  shell: '#121316',
  shellDeep: '#141518',
  shellRaised: '#1B1C20',
  shellOverlay: '#232529',
  shellLine: '#2F3137',
  shellHairline: 'rgba(255, 255, 255, 0.08)',
  shellHairlineStrong: 'rgba(161, 161, 170, 0.45)',
  shellHighlight: 'rgba(255, 255, 255, 0.04)',
  panel: '#1B1C20',
  panelRaised: '#232529',
  panelDark: '#1B1C20',
  panelLine: '#2F3137',
  panelSunken: '#16171A',
  panelHairline: 'rgba(255, 255, 255, 0.08)',
  ink: '#F4F4F5',
  inkMuted: '#C6C7CC',
  inkSubtle: '#9B9CA4',
  inkOnShell: '#F4F4F5',
  inkOnShellMuted: '#C6C7CC',
  controlBorder: '#75767E',
  routeRecommendedCasing: '#121316',
  routeMuted: '#9B9CA4',
  tealSoft: '#12292A',
  recommendedSurface: '#12292A',
  warnSurface: '#32270F',
  corroboratedSurface: '#32270F',
  dangerSurface: '#38181A',
  positiveSoft: '#12291C',
  live: '#C6C7CC',
  liveInk: '#F4F4F5',
  liveSurface: '#232529',
  resolved: '#9B9CA4',
  roadMajor: '#2F3137',
  roadMinor: '#232529',
  railway: '#C6C7CC',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

/** Themes for the web control room: Porcelain light, and Midnight indigo dark. */
export const consoleThemes = { dark: consoleDark, light: consoleLight } as const;

/**
 * Control-room chrome: the deep-navy command bar and hero card, identical in light and dark so the
 * room's anchor reads the same in both. Luminous teal (chromeAccent) is for graphics and large
 * numerals on the navy; status colours never sit on it (chips bring their own surface).
 */
export const consoleChrome = {
  chromeBg: '#0B1426',
  chromeRaised: '#111C33',
  /** Deep indigo the hero card's gradient starts from. */
  chromeIndigo: '#1E1B4B',
  chromeLine: 'rgba(148, 163, 184, 0.22)',
  chromeFill: 'rgba(248, 250, 252, 0.07)',
  chromeFillStrong: 'rgba(248, 250, 252, 0.14)',
  chromeInk: '#F8FAFC',
  chromeInkMuted: '#CBD5E1',
  chromeAccent: '#2DD4BF',
  chromeOnAccent: '#0B1426',
  chromeGlow: 'rgba(45, 212, 191, 0.28)',
} as const;

/** Chrome text and graphic pairs, checked by test/contrast.test.ts. */
export const chromeContrastPairs: { fg: keyof typeof consoleChrome; bg: keyof typeof consoleChrome; min: number; what: string }[] = [
  { fg: 'chromeInk', bg: 'chromeBg', min: 4.5, what: 'text on the command bar' },
  { fg: 'chromeInkMuted', bg: 'chromeBg', min: 4.5, what: 'muted text on the command bar' },
  { fg: 'chromeInk', bg: 'chromeRaised', min: 4.5, what: 'text on the hero card' },
  { fg: 'chromeInkMuted', bg: 'chromeRaised', min: 4.5, what: 'muted text on the hero card' },
  { fg: 'chromeAccent', bg: 'chromeBg', min: 4.5, what: 'luminous teal on the command bar' },
  { fg: 'chromeAccent', bg: 'chromeRaised', min: 4.5, what: 'luminous teal on the hero card' },
  { fg: 'chromeOnAccent', bg: 'chromeAccent', min: 4.5, what: 'primary button label on the command bar' },
  { fg: 'chromeInk', bg: 'chromeIndigo', min: 4.5, what: 'text on the indigo end of the hero card' },
  { fg: 'chromeInkMuted', bg: 'chromeIndigo', min: 4.5, what: 'muted text on the indigo end of the hero card' },
  { fg: 'chromeAccent', bg: 'chromeIndigo', min: 4.5, what: 'luminous teal on the indigo end of the hero card' },
];

/**
 * Console brand: the signature indigo-to-teal gradient and the aurora tints behind the panels.
 * Brand moments and primary actions only (logo, wordmark, primary buttons, the command bar's light
 * line, timeline progress); never status, routes or body text. Both gradient ends carry white text
 * at AA, so every point between them does too.
 */
export const consoleBrand = {
  brandFrom: '#4F46E5',
  brandVia: '#6D28D9',
  brandTo: '#0F766E',
  onBrand: '#FFFFFF',
  brandGlow: 'rgba(79, 70, 229, 0.28)',
  auroraIndigo: 'rgba(99, 102, 241, 0.24)',
  auroraTeal: 'rgba(20, 184, 166, 0.24)',
  auroraViolet: 'rgba(168, 85, 247, 0.16)',
} as const;

/** Brand pairs, checked by test/contrast.test.ts. */
export const brandContrastPairs: { fg: keyof typeof consoleBrand; bg: keyof typeof consoleBrand; min: number; what: string }[] = [
  { fg: 'onBrand', bg: 'brandFrom', min: 4.5, what: 'label on the indigo end of a brand button' },
  { fg: 'onBrand', bg: 'brandVia', min: 4.5, what: 'label on the violet middle of a brand button' },
  { fg: 'onBrand', bg: 'brandTo', min: 4.5, what: 'label on the teal end of a brand button' },
];

/** Default theme per surface (DESIGN.md 12.1): the console projects in lit rooms; phones follow the system. */
export const defaultTheme = { console: 'light', phone: 'system' } as const;

/** Text and graphic pairs the UI relies on, checked by test/contrast.test.ts. */
export const contrastPairs: { fg: keyof ThemeColors; bg: keyof ThemeColors; min: number; what: string }[] = [
  ...(['ink', 'inkMuted', 'inkSubtle', 'accentInk', 'warnInk', 'corroboratedInk', 'dangerInk', 'positiveInk', 'liveInk'] as const).flatMap((fg) => [
    { fg, bg: 'panel' as const, min: 4.5, what: `${fg} text on cards` },
    { fg, bg: 'panelSunken' as const, min: 4.5, what: `${fg} text on sunken areas` },
  ]),
  { fg: 'inkOnShell', bg: 'shell', min: 4.5, what: 'text on the page' },
  { fg: 'inkOnShellMuted', bg: 'shell', min: 4.5, what: 'muted text on the page' },
  { fg: 'inkOnShell', bg: 'shellRaised', min: 4.5, what: 'text on floating rails' },
  { fg: 'inkOnShellMuted', bg: 'shellRaised', min: 4.5, what: 'muted text on floating rails' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, what: 'primary button label' },
  { fg: 'warnInk', bg: 'warnSurface', min: 4.5, what: 'Unverified chip' },
  { fg: 'corroboratedInk', bg: 'corroboratedSurface', min: 4.5, what: 'Corroborated chip' },
  { fg: 'dangerInk', bg: 'dangerSurface', min: 4.5, what: 'Verified / Not viable chip' },
  { fg: 'liveInk', bg: 'liveSurface', min: 4.5, what: 'Live data badge' },
  { fg: 'recommendedInk', bg: 'recommendedSurface', min: 4.5, what: 'Recommended state treatment' },
  { fg: 'positiveInk', bg: 'positiveSoft', min: 4.5, what: 'Resolved state treatment' },
  { fg: 'controlBorder', bg: 'panel', min: 3, what: 'essential control boundaries on cards' },
  { fg: 'positive', bg: 'shellDeep', min: 3, what: 'resolved markers on the map' },
  { fg: 'routeRecommended', bg: 'shellDeep', min: 3, what: 'recommended route on the map' },
  { fg: 'routeMuted', bg: 'shellDeep', min: 3, what: 'alternative routes on the map' },
  { fg: 'danger', bg: 'shellDeep', min: 3, what: 'blocked route and verified markers on the map' },
  { fg: 'warn', bg: 'shellDeep', min: 3, what: 'unverified markers on the map' },
  { fg: 'corroborated', bg: 'shellDeep', min: 3, what: 'corroborated markers on the map' },
  { fg: 'railway', bg: 'shellDeep', min: 3, what: 'the railway on the map' },
  { fg: 'focus', bg: 'shell', min: 3, what: 'focus ring' },
];
