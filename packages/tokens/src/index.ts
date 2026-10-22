/**
 * VIGHNAWAY design tokens. Source of truth: docs/DESIGN.md section "Tokens".
 * Change a value here only together with DESIGN.md. No surface may hard-code colours or sizes.
 */

export const colors = {
  shell: '#0B0817',
  shellRaised: '#13203A',
  shellLine: '#22314F',
  panel: '#F7F5F0',
  panelDark: '#111C33',
  panelLine: '#E2DED4',
  panelSunken: '#EEEBE3',
  ink: '#0F172A',
  inkMuted: '#475569',
  inkOnShell: '#E8EDF5',
  inkOnShellMuted: '#D2C9EA',
  routeRecommended: '#C8F560',
  routeRecommendedCasing: '#0B0817',
  /** Darker tint for the part of the route already travelled. */
  routeTravelled: '#0F766E',
  routeMuted: '#94A3B8',
  warn: '#F59E0B',
  /** Warn as text on light panels (AA on #F7F5F0). */
  warnInk: '#92400E',
  warnSurface: '#FEF3C7',
  danger: '#DC2626',
  dangerInk: '#991B1B',
  dangerSurface: '#FEE2E2',
  positive: '#16A34A',
  positiveInk: '#166534',
  floodProne: 'rgba(56, 189, 248, 0.35)',
  floodProneSolid: '#38BDF8',
  resolved: '#94A3B8',
  scrim: 'rgba(11, 20, 38, 0.6)',
  white: '#FFFFFF',
  // v2 depth system (DESIGN.md section 11): layered navy surfaces, hairlines and soft tints.
  shellDeep: '#070D1A',
  shellOverlay: '#16233F',
  shellHairline: 'rgba(148, 163, 184, 0.14)',
  shellHairlineStrong: 'rgba(148, 163, 184, 0.26)',
  /** 1px inner top highlight on raised navy surfaces. */
  shellHighlight: 'rgba(255, 255, 255, 0.06)',
  panelRaised: '#FFFFFF',
  panelHairline: 'rgba(15, 23, 42, 0.08)',
  tealSoft: 'rgba(20, 184, 166, 0.14)',
  tealGlow: 'rgba(20, 184, 166, 0.45)',
  warnSoft: 'rgba(245, 158, 11, 0.16)',
  dangerSoft: 'rgba(220, 38, 38, 0.18)',
  dangerGlow: 'rgba(220, 38, 38, 0.5)',
  positiveSoft: 'rgba(22, 163, 74, 0.16)',
  roadMajor: '#2A3B5C',
  roadMinor: '#1C2A45',
  railway: '#C7CFDB',
} as const;
export type ColorToken = keyof typeof colors;

/** 8-point grid (4 allowed for hairline adjustments). */
export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export type SpacingToken = keyof typeof spacing;

export const radius = { sheet: 20, card: 14, chip: 999, button: 12, marker: 18 } as const;

export const fontFamily = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  /** CSS stack for the console. */
  web: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  /** Instrument readouts: clock, ETA digits, metadata eyebrows. */
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
  webMono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** Type scale. ETA uses tabular numerals so numbers do not jitter when they change. */
export const type = {
  eta: { size: 32, lineHeight: 38, weight: '700', tabular: true },
  title: { size: 18, lineHeight: 24, weight: '600', tabular: false },
  body: { size: 15, lineHeight: 22, weight: '400', tabular: false },
  meta: { size: 13, lineHeight: 18, weight: '500', tabular: false },
  /** Console projector base. */
  consoleBase: { size: 18, lineHeight: 26, weight: '400', tabular: false },
  consoleTitle: { size: 24, lineHeight: 30, weight: '600', tabular: false },
  consoleClock: { size: 40, lineHeight: 44, weight: '700', tabular: true },
  /** v2: hero ETA on the console decision card and the phone sheet. */
  display: { size: 48, lineHeight: 52, weight: '700', tabular: true },
  /** v2: uppercase mono eyebrow labels ("RECOMMENDED", "LIVE"). letterSpacing in px. */
  eyebrow: { size: 12, lineHeight: 16, weight: '600', tabular: true },
} as const;

/** Letter spacing (px) for eyebrow labels and the wordmark. */
export const letterSpacing = { eyebrow: 1.2, wordmark: 2.4 } as const;

/** Elevation: web box-shadows and native shadow props for the same three levels. */
export const elevation = {
  web: {
    sm: '0 1px 2px rgba(2, 6, 23, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    md: '0 8px 24px -6px rgba(2, 6, 23, 0.55), 0 2px 6px rgba(2, 6, 23, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    lg: '0 24px 64px -12px rgba(2, 6, 23, 0.7), 0 4px 12px rgba(2, 6, 23, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
    panel: '0 12px 32px -8px rgba(2, 6, 23, 0.45), 0 2px 4px rgba(2, 6, 23, 0.15)',
    glowTeal: '0 0 0 1px rgba(20, 184, 166, 0.5), 0 0 24px rgba(20, 184, 166, 0.35)',
    glowDanger: '0 0 0 1px rgba(220, 38, 38, 0.55), 0 0 24px rgba(220, 38, 38, 0.4)',
  },
  native: {
    sm: { shadowColor: '#020617', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    md: { shadowColor: '#020617', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    lg: { shadowColor: '#020617', shadowOpacity: 0.38, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  },
} as const;
export type TypeToken = keyof typeof type;

export const routeStyles = {
  recommended: { color: colors.routeRecommended, width: 6, casing: colors.routeRecommendedCasing, casingWidth: 9, opacity: 1, dash: null },
  // Alternatives are drawn the way Google Maps draws them: a clear grey line with an outline, under the blue route.
  usual_fastest: { color: colors.routeMuted, width: 5, casing: colors.routeRecommendedCasing, casingWidth: 8, opacity: 1, dash: null },
  alternative: { color: colors.routeMuted, width: 5, casing: colors.routeRecommendedCasing, casingWidth: 8, opacity: 0.9, dash: null },
  blocked: { color: colors.danger, width: 4, casing: null, casingWidth: 0, opacity: 1, dash: [10, 8] as readonly number[] },
  travelled: { color: colors.routeTravelled, width: 6, casing: colors.routeRecommendedCasing, casingWidth: 9, opacity: 1, dash: null },
  floodProne: { color: colors.floodProne, width: 8, casing: null, casingWidth: 0, opacity: 1, dash: [2, 6] as readonly number[] },
} as const;
export type RouteStyleKey = keyof typeof routeStyles;

/** Z-order bottom to top (BUILD_PROMPT 8.6). */
export const zIndex = {
  floodProne: 1,
  alternative: 2,
  usual_fastest: 3,
  blocked: 4,
  recommended: 5,
  travelled: 6,
  blockingMarker: 7,
  incidentMarker: 8,
  vehicle: 9,
} as const;

export const marker = {
  size: 36,
  glyphSize: 20,
  ringWidth: 2,
  selectedScale: 1.15,
  agePillHeight: 18,
  /** Incident markers on the phone's map: small, so a live feed with many closures stays readable (the console keeps `size`). */
  mapSize: 26,
  mapGlyphSize: 14,
  mapAgePillHeight: 16,
  /** Ring language shared by markers and evidence chips. */
  ring: {
    unverified: { style: 'dashed', color: colors.warn },
    corroborated: { style: 'double', color: colors.warn },
    verified: { style: 'solid', color: colors.danger },
    resolved: { style: 'struck', color: colors.resolved },
    dismissed: { style: 'struck', color: colors.resolved },
  },
} as const;

/** Durations in ms (BUILD_PROMPT 6.6). Zero all of them when reduce motion is on. */
export const motion = {
  launchReveal: 600,
  evaluatingMin: 400,
  routeChangeTotal: 900,
  routeChangeFlash: 150,
  newIncident: 350,
  statusUpgrade: 250,
  buttonPress: 100,
  buttonPressScale: 0.97,
  reportSent: 300,
  noViableRoute: 300,
  noViableMapDim: 0.4,
  banner: 250,
  spring: { damping: 22, stiffness: 220, mass: 1, overshootClamping: true },
  /** v2 easing curves as cubic-bezier control points. */
  easeOut: [0.16, 1, 0.3, 1] as readonly number[],
  easeInOut: [0.65, 0, 0.35, 1] as readonly number[],
  /** Stagger between list items entering, ms. */
  stagger: 40,
  /** Snappy spring for presses and chips; soft spring for cards and sheets. */
  springSnappy: { damping: 18, stiffness: 320, mass: 0.8 },
  springSoft: { damping: 24, stiffness: 180, mass: 1 },
  skeletonShimmer: 1400,
  /** Flowing dashes along the recommended route (ms per cycle). */
  routeFlow: 1600,
  pulse: 1800,
} as const;

export const layout = {
  drawerMaxWidth: 320,
  drawerWidthRatio: 0.8,
  searchCardOffset: 8,
  sheetSnapPeek: 280,
  /** Lowest sheet stop floor (dp): handle, ETA, route name and Start; grows with large text. */
  sheetSnapMini: 120,
  sheetSnapHalf: '50%',
  sheetSnapFull: '92%',
  minTouch: 48,
  consoleMinWidth: 1280,
} as const;

/** Google Maps custom style: navy land, colourless roads, visible railway, no teal/amber/red. */
export const googleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0B1426' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9AA8BF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1426' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#22314F' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#0E1A30' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#162540' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }, { lightness: 20 }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#10213A' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A2945' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0B1426' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#22334F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2B3D5C' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#B8C4D6' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#C7CFDB' }, { weight: 1.6 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06101F' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4B5D7A' }] },
] as const;

export { themes, phoneThemes, phoneBrand, phoneBrandContrastPairs, phoneRadius, phoneElevation, consoleThemes, consoleChrome, consoleBrand, chromeContrastPairs, brandContrastPairs, defaultTheme, contrastPairs } from './themes';
export type { PhoneBrand, ThemeColors, ThemeName } from './themes';
export { identity, identityContrastPairs } from './identity';
export type { Identity } from './identity';

/** Google Maps style for the light theme: warm neutral land, white roads, quiet blue water, visible railway. */
export const googleMapStyleLight = [
  { elementType: 'geometry', stylers: [{ color: '#EFECE5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#D8D3C8' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#EAE6DE' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#E6E2D9' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E1E6DA' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#DDD8CD' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#CFC9BC' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#475569' }, { weight: 1.4 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C7DAE6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4A6A8C' }] },
] as const;

/** Map style per theme. */
export const googleMapStyles = { dark: googleMapStyle, light: googleMapStyleLight } as const;

/**
 * Phone map styles (DESIGN.md section 14): natural colours, so the basemap reads like the real
 * place: green parks, blue water, warm land, white roads, amber highways. Generic points of interest
 * stay hidden (hospitals and parks stay) so the route and incident markers remain the focus.
 */
export const googleMapStylePhoneLight = [
  { elementType: 'geometry', stylers: [{ color: '#F3EDE2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4A3F66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#D4C9B6' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#EBE3D5' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E4EAD0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#C9E2A0' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#F5D5D5' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E6DCCB' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFF6DC' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFD479' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#EDB84A' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#4A3F66' }, { weight: 1.4 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#A8DCEB' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2F6A86' }] },
] as const;

export const googleMapStylePhoneDark = [
  { elementType: 'geometry', stylers: [{ color: '#181030' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#B9AEDA' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B0817' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2D2150' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1D1438' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#15241A' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1B3A22' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#3A1F33' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2E2352' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#120B26' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#3B2E66' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#7A5A1E' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#4A3512' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#D2C9EA' }, { weight: 1.6 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E3A52' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6FB7D6' }] },
] as const;
export const phoneGoogleMapStyles = { dark: googleMapStylePhoneDark, light: googleMapStylePhoneLight } as const;

/** Google Maps style for the console's Porcelain light theme: cool grey land, white roads, soft blue water. */
export const googleMapStyleConsoleLight = [
  { elementType: 'geometry', stylers: [{ color: '#E4E9F1' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#CBD3DF' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#DEE4EC' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#D9E0EA' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D9E5E0' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D3DAE5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#C3CCDA' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#475569' }, { weight: 1.4 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C4D9EA' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#486A8E' }] },
] as const;

/** Map style per theme for the web control room. */
export const googleMapStyleConsoleDark = [
  { elementType: 'geometry', stylers: [{ color: '#141518' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A3A4AB' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#141518' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#303238' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#18191C' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#232529' }] },
  { featureType: 'poi.medical', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }, { lightness: 20 }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#172219' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27292E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#141518' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#31333A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#41444B' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#C6C7CC' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#C6C7CC' }, { weight: 1.6 }] },
  { featureType: 'transit.station.rail', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.icon', stylers: [{ visibility: 'on' }, { saturation: -100 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F1215' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6E7079' }] },
] as const;

export const consoleGoogleMapStyles = { dark: googleMapStyleConsoleDark, light: googleMapStyleConsoleLight } as const;

export const tokens = { colors, spacing, radius, fontFamily, type, letterSpacing, elevation, routeStyles, zIndex, marker, motion, layout } as const;
export default tokens;

export { humanSilhouette, incidentIcons, incidentIconStyle } from './incidentIcons';
export type { IncidentIconKey, IncidentIconLayer } from './incidentIcons';
