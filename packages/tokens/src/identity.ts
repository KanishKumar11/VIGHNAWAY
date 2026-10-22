/**
 * Monsoon Signal: the phone's first-run identity (docs/DESIGN_VISION.md appendix B).
 *
 * A fixed night scene, the same in light and dark mode, like a splash: a rain-dark aubergine sky,
 * a luminous signal-lime route (the colour of "go" on a rail signal), flood-aqua water and a
 * marigold warning. None of the hues is the blue-and-white of mainstream map apps. Status meaning
 * is unchanged: marigold is Unverified and Corroborated (dashed vs double ring), coral is blocked,
 * lime is the recommended way. Every text pair is checked by test/identity.test.ts.
 */
export const identity = {
  // Sky: top to bottom
  skyTop: '#0B0817',
  skyMid: '#150E2E',
  skyLow: '#26123F',
  // Map ground
  road: 'rgba(210, 201, 234, 0.14)',
  roadMajor: 'rgba(210, 201, 234, 0.24)',
  rain: 'rgba(210, 201, 234, 0.26)',
  // The route
  lime: '#C8F560',
  limeGlow: 'rgba(200, 245, 96, 0.30)',
  onLime: '#14102A',
  // Water
  water: '#2FD3F2',
  waterFill: 'rgba(47, 211, 242, 0.20)',
  waterDeep: 'rgba(47, 211, 242, 0.07)',
  // Warning and blocked
  marigold: '#FFB320',
  marigoldSoft: 'rgba(255, 179, 32, 0.16)',
  marigoldGlow: 'rgba(255, 179, 32, 0.20)',
  coral: '#FF7A6B',
  // Text
  text: '#FFF6E8',
  textMuted: '#D2C9EA',
  textSubtle: '#B2A8D2',
  // Glass
  glass: 'rgba(255, 255, 255, 0.08)',
  glassStrong: 'rgba(255, 255, 255, 0.14)',
  glassEdge: 'rgba(255, 255, 255, 0.18)',
} as const;

export type Identity = { [K in keyof typeof identity]: string };

/** Text and graphic pairs on the identity sky, checked by test/identity.test.ts. */
export const identityContrastPairs: { fg: keyof Identity; bg: keyof Identity; min: number; what: string }[] = [
  { fg: 'text', bg: 'skyTop', min: 4.5, what: 'headline on the top of the sky' },
  { fg: 'text', bg: 'skyLow', min: 4.5, what: 'headline on the bottom of the sky' },
  { fg: 'textMuted', bg: 'skyMid', min: 4.5, what: 'body text' },
  { fg: 'textMuted', bg: 'skyLow', min: 4.5, what: 'body text at the bottom of the sky' },
  { fg: 'textSubtle', bg: 'skyLow', min: 4.5, what: 'small labels at the bottom of the sky' },
  { fg: 'onLime', bg: 'lime', min: 4.5, what: 'primary button label' },
  { fg: 'lime', bg: 'skyMid', min: 3, what: 'route on the sky' },
  { fg: 'marigold', bg: 'skyMid', min: 3, what: 'warning ring on the sky' },
  { fg: 'coral', bg: 'skyMid', min: 3, what: 'blocked segment on the sky' },
  { fg: 'water', bg: 'skyMid', min: 3, what: 'flood contour on the sky' },
];
