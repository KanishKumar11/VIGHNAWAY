// Generates the shared Lottie animations from token colours (no hand-edited JSON).
// Run: pnpm --filter @vighnaway/tokens run lottie. Output: packages/tokens/lottie/*.json, used by
// the console (lottie-react) and the phone (lottie-react-native).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '../src/index';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'lottie');
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const ease = { o: { x: [0.16], y: [1] }, i: { x: [0.3], y: [1] } };
const kf = (frames: [number, number[]][]) => ({
  a: 1,
  k: frames.map(([t, s], i) => (i < frames.length - 1 ? { t, s, ...ease } : { t, s })),
});
const st = (v: unknown) => ({ a: 0, k: v });
const transform = (o: object = {}) => ({ o: st(100), r: st(0), p: st([60, 60, 0]), a: st([0, 0, 0]), s: st([100, 100, 100]), ...o });

function ring(delay: number, total: number, color: number[]) {
  return {
    ty: 4,
    nm: `ring-${delay}`,
    ip: 0,
    op: total,
    st: 0,
    ks: transform({
      s: kf([[delay, [20, 20, 100]], [delay + 60, [100, 100, 100]]]),
      o: kf([[delay, [90]], [delay + 60, [0]]]),
    }),
    shapes: [
      { ty: 'el', p: st([0, 0]), s: st([100, 100]) },
      { ty: 'st', c: st(color), o: st(100), w: st(3), lc: 2, lj: 2 },
    ],
  };
}

const teal = rgb(colors.routeRecommended);
const scan = {
  v: '5.7.0', fr: 60, ip: 0, op: 120, w: 120, h: 120, nm: 'vighnaway-scan', ddd: 0, assets: [],
  layers: [
    {
      ty: 4, nm: 'core', ip: 0, op: 120, st: 0,
      ks: transform({ s: kf([[0, [100, 100, 100]], [30, [118, 118, 100]], [60, [100, 100, 100]], [90, [118, 118, 100]], [120, [100, 100, 100]]]) }),
      shapes: [{ ty: 'el', p: st([0, 0]), s: st([22, 22]) }, { ty: 'fl', c: st(teal), o: st(100) }],
    },
    ring(0, 120, teal),
    ring(40, 120, teal),
    ring(80, 120, teal),
  ],
};

const success = {
  v: '5.7.0', fr: 60, ip: 0, op: 60, w: 120, h: 120, nm: 'vighnaway-success', ddd: 0, assets: [],
  layers: [
    {
      ty: 4, nm: 'check', ip: 0, op: 60, st: 0, ks: transform(),
      shapes: [
        { ty: 'sh', ks: st({ i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[-20, 2], [-6, 16], [22, -14]], c: false }) },
        { ty: 'st', c: st(teal), o: st(100), w: st(8), lc: 2, lj: 2 },
        { ty: 'tm', s: st(0), e: kf([[18, [0]], [42, [100]]]), o: st(0), m: 1 },
      ],
    },
    {
      ty: 4, nm: 'circle', ip: 0, op: 60, st: 0,
      ks: transform({ s: kf([[0, [60, 60, 100]], [22, [100, 100, 100]]]), o: kf([[0, [0]], [12, [100]]]) }),
      shapes: [
        { ty: 'el', p: st([0, 0]), s: st([88, 88]) },
        { ty: 'st', c: st(teal), o: st(100), w: st(6), lc: 2, lj: 2 },
        { ty: 'tm', s: st(0), e: kf([[0, [0]], [24, [100]]]), o: st(0), m: 1 },
      ],
    },
  ],
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'scan.json'), JSON.stringify(scan));
writeFileSync(join(out, 'success.json'), JSON.stringify(success));
console.log(`wrote ${out}/scan.json, success.json`);
