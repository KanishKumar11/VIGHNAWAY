// Generates the VIGHNAWAY mark (a route line bending around an obstacle, signal lime on monsoon ink) as SVG
// sources in assets/brand/ and exports the PNGs Expo needs into assets/images/.
// Run: node scripts/gen-brand.mjs   (uses sharp, already installed in the workspace)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { colors } = require('@vighnaway/tokens');
const sharp = require('sharp');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(root, 'assets/brand');
const imgDir = join(root, 'assets/images');
mkdirSync(brandDir, { recursive: true });
mkdirSync(imgDir, { recursive: true });

// 100-unit artboard. The obstacle sits on the straight line from origin to destination; the route
// leaves that line, bends around it and rejoins.
const ROUTE = 'M20 80 L29 71 C36 64 27 42 42 33 C53 26 61 35 71 29 L80 20';
const markPaths = ({ route, obstacle, casing, hole }) => `
  <path d="M20 80 L80 20" fill="none" stroke="${obstacle}" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round" opacity="0.6"/>
  ${casing ? `<path d="${ROUTE}" fill="none" stroke="${casing}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <path d="${ROUTE}" fill="none" stroke="${route}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="45" y="45" width="14" height="14" rx="2.5" transform="rotate(45 52 52)" fill="${hole ?? 'none'}" stroke="${obstacle}" stroke-width="4"/>
  <circle cx="20" cy="80" r="6.5" fill="${route}"/>
  <circle cx="80" cy="20" r="6.5" fill="${hole ?? 'none'}" stroke="${route}" stroke-width="4"/>`;

const svg = ({ size = 1024, bg, scale = 1, ...p }) => {
  const s = (size / 100) * scale;
  const off = (size - 100 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
  <g transform="translate(${off} ${off}) scale(${s})">${markPaths(p)}
  </g>
</svg>
`;
};

const variants = {
  // Full-bleed app icon (iOS and legacy Android).
  'icon.svg': svg({ bg: colors.shell, scale: 0.78, route: colors.routeRecommended, obstacle: colors.inkOnShellMuted, casing: colors.routeRecommendedCasing, hole: colors.shell }),
  // Adaptive icon foreground: transparent, mark inside the 66% safe zone.
  'android-icon-foreground.svg': svg({ scale: 0.52, route: colors.routeRecommended, obstacle: colors.inkOnShellMuted, casing: colors.routeRecommendedCasing, hole: colors.shell }),
  // Themed (monochrome) icon: single colour on transparent.
  'android-icon-monochrome.svg': svg({ scale: 0.52, route: colors.white, obstacle: colors.white }),
  // Splash image (centred on the navy splash background set in app.config.ts).
  'splash-icon.svg': svg({ size: 512, scale: 0.9, route: colors.routeRecommended, obstacle: colors.inkOnShellMuted, casing: colors.routeRecommendedCasing, hole: colors.shell }),
};

for (const [name, content] of Object.entries(variants)) {
  writeFileSync(join(brandDir, name), content);
  const png = join(imgDir, name.replace(/\.svg$/, '.png'));
  await sharp(Buffer.from(content)).png().toFile(png);
  console.log('wrote', join('assets/brand', name), '->', join('assets/images', name.replace(/\.svg$/, '.png')));
}
