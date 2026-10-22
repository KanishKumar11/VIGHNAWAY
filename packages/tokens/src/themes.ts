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
