// Builds every icon the apps need from the two brand masters:
//   assets/images/appicon.png        the square app tile (rounded square on transparent)
//   assets/brand/wordmark-source.png the wide logo (mark + VIGHNAWAY) on black
// Mobile: icon, adaptive foreground (opaque, mark inside the Android safe zone), monochrome, splash.
// Console: favicon, apple icon, tile and the wordmark with its black keyed out.
// Run: node scripts/gen-app-icon.mjs   (uses sharp, already installed in the workspace)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imgDir = join(root, 'assets/images');
const consoleApp = join(root, '../console/src/app');
const consolePublic = join(root, '../console/public/brand');
mkdirSync(consolePublic, { recursive: true });

const load = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const png = (img, file) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).png().toFile(file);
const bboxOf = ({ data, w, h }, keep) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!keep(data, (y * w + x) * 4)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
};

// ---- the tile: trim the transparent margin, square it ----
const src = await load(join(imgDir, 'appicon.png'));
const tb = bboxOf(src, (d, i) => d[i + 3] > 8);
const side = Math.max(tb.width, tb.height);
const tileBuf = await sharp(join(imgDir, 'appicon.png'))
  .extract(tb)
  .resize(side, side, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const tile = (size) => sharp(tileBuf).resize(size, size);
// The tile's own background colour, sampled just inside its top edge.
const bgPx = await sharp(tileBuf).extract({ left: Math.round(side / 2), top: Math.round(side * 0.06), width: 1, height: 1 }).raw().toBuffer();
const plum = { r: bgPx[0], g: bgPx[1], b: bgPx[2] };
const fullBleed = (size) => tile(size).flatten({ background: plum });

// ---- the mark alone: key the tile's flat background out to alpha ----
const bleed = await fullBleed(1024).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mark = { data: Buffer.from(bleed.data), w: 1024, h: 1024 };
const D = 240;
for (let i = 0; i < mark.data.length; i += 4) {
  const dr = mark.data[i] - plum.r, dg = mark.data[i + 1] - plum.g, db = mark.data[i + 2] - plum.b;
  const dist = Math.hypot(dr, dg, db);
  const a = Math.min(1, Math.max(0, (dist - 6) / (D - 6)));
  if (a > 0) {
    mark.data[i] = Math.min(255, Math.max(0, plum.r + dr / a));
    mark.data[i + 1] = Math.min(255, Math.max(0, plum.g + dg / a));
    mark.data[i + 2] = Math.min(255, Math.max(0, plum.b + db / a));
  }
  mark.data[i + 3] = Math.round(a * 255);
}
const mb = bboxOf(mark, (d, i) => d[i + 3] > 40);
const cx = mb.left + mb.width / 2, cy = mb.top + mb.height / 2;
let radius = 0;
for (let y = 0; y < mark.h; y++) for (let x = 0; x < mark.w; x++) {
  if (mark.data[(y * mark.w + x) * 4 + 3] > 40) radius = Math.max(radius, Math.hypot(x - cx, y - cy));
}
const markPng = await sharp(mark.data, { raw: { width: 1024, height: 1024, channels: 4 } }).extract(mb).png().toBuffer();

/** The mark centred on a transparent square canvas, scaled so its farthest point sits `reach` px from the centre. */
const markOnCanvas = async (canvas, reach) => {
  const k = reach / radius;
  const w = Math.round(mb.width * k), h = Math.round(mb.height * k);
  const piece = await sharp(markPng).resize(w, h).png().toBuffer();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: piece, left: Math.round(canvas / 2 - w / 2), top: Math.round(canvas / 2 - h / 2) }])
    .png()
    .toBuffer();
};

// ---- mobile ----
// Full-bleed launcher icon (iOS and legacy Android): the mark centred on its own bounding box, 72% of the width.
await sharp(await markOnCanvas(1024, radius * ((1024 * 0.72) / mb.width))).flatten({ background: plum }).png().toFile(join(imgDir, 'icon.png'));
// Android adaptive: the visible circle is 66/108 of the canvas, so the mark stays inside radius 0.30 of it.
const fg = await markOnCanvas(1024, 1024 * 0.3);
await sharp(fg).flatten({ background: plum }).png().toFile(join(imgDir, 'android-icon-foreground.png'));
await sharp(fg).ensureAlpha().linear([0, 0, 0, 1], [255, 255, 255, 0]).png().toFile(join(imgDir, 'android-icon-monochrome.png'));
await sharp(await markOnCanvas(1024, 1024 * 0.46)).png().toFile(join(imgDir, 'splash-icon.png'));

// ---- console ----
await tile(256).png().toFile(join(consolePublic, 'vighnaway-tile.png'));
const iconSrc = join(imgDir, 'icon.png');
await sharp(iconSrc).resize(192, 192).png().toFile(join(consoleApp, 'icon.png'));
await sharp(iconSrc).resize(180, 180).png().toFile(join(consoleApp, 'apple-icon.png'));

// The wordmark: only the black connected to the border becomes transparent, so the dark route dashes inside
// the mark stay opaque. Edge pixels get partial alpha from their brightness.
const wm = await load(join(root, 'assets/brand/wordmark-source.png'));
const { w, h } = wm;
const lum = (i) => Math.max(wm.data[i], wm.data[i + 1], wm.data[i + 2]);
const outside = new Uint8Array(w * h);
const queue = [];
const push = (x, y) => {
  const p = y * w + x;
  if (outside[p] || lum(p * 4) > 70) return;
  outside[p] = 1;
  queue.push(p);
};
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
for (let q = 0; q < queue.length; q++) {
  const p = queue[q], x = p % w, y = (p / w) | 0;
  if (x > 0) push(x - 1, y);
  if (x < w - 1) push(x + 1, y);
  if (y > 0) push(x, y - 1);
  if (y < h - 1) push(x, y + 1);
}
// Soften the one-pixel rim next to the outside region.
const rim = new Uint8Array(w * h);
for (let p = 0; p < w * h; p++) {
  if (outside[p]) continue;
  const x = p % w, y = (p / w) | 0;
  if ((x > 0 && outside[p - 1]) || (x < w - 1 && outside[p + 1]) || (y > 0 && outside[p - w]) || (y < h - 1 && outside[p + w])) rim[p] = 1;
}
for (let p = 0; p < w * h; p++) {
  const i = p * 4;
  if (outside[p]) { wm.data[i + 3] = 0; continue; }
  if (rim[p]) {
    const a = Math.min(1, lum(i) / 140);
    if (a > 0) for (let c = 0; c < 3; c++) wm.data[i + c] = Math.min(255, wm.data[i + c] / a);
    wm.data[i + 3] = Math.round(a * 255);
  }
}
const wb = bboxOf(wm, (d, i) => d[i + 3] > 20);
const pad = Math.round(wb.height * 0.04);
await sharp(wm.data, { raw: { width: w, height: h, channels: 4 } })
  .extract({
    left: Math.max(0, wb.left - pad), top: Math.max(0, wb.top - pad),
    width: Math.min(w - Math.max(0, wb.left - pad), wb.width + pad * 2), height: Math.min(h - Math.max(0, wb.top - pad), wb.height + pad * 2),
  })
  .resize({ width: 1200 })
  .png()
  .toFile(join(consolePublic, 'vighnaway-wordmark.png'));

console.log('plum', plum, 'mark radius', radius.toFixed(0), 'wordmark bbox', wb);
