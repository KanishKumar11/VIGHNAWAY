import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedProps, useSharedValue, withDelay, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { identity } from '@vighnaway/tokens';
import { AppText } from '@/components/AppText';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { springEntry } from '@/components/motion';
import { t } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { fontFamily, hairline, radius, spacing } from '@/theme';

export type Step = 1 | 2 | 3;

/** Scene space: every coordinate below is in this 360 x 440 box and is scaled to cover the stage. */
const VB_W = 360;
const VB_H = 440;
const ORIGIN = { x: 56, y: 362 };
const DEST = { x: 306, y: 70 };
const FLOOD = { x: 176, y: 262 };
// The usual way runs straight through the water; the detour bends around it and rejoins the road.
const USUAL = `M${ORIGIN.x} ${ORIGIN.y} C70 330 110 290 ${FLOOD.x} ${FLOOD.y} C236 238 250 150 ${DEST.x} ${DEST.y}`;
const DETOUR = `M${ORIGIN.x} ${ORIGIN.y} C60 330 70 250 92 190 C112 140 190 150 224 170 C262 192 270 120 ${DEST.x} ${DEST.y}`;
const BLOCKED = 'M117 287 L230 240';
const STREETS = [
  'M-20 330 C60 300 120 372 200 344 S340 270 380 292',
  'M254 -10 C238 90 276 170 252 300 S230 420 242 460',
  'M-10 118 C80 142 142 98 232 128 S340 154 380 118',
  'M90 450 C104 360 78 262 118 204 S154 60 142 -10',
];
const FLOOD_R = { 1: 48, 2: 54, 3: 66 } as const;
const RING = 56;
const LEN = 1000;

// A fixed field of rain strokes (no randomness, so the scene is the same every time).
const RAIN = Array.from({ length: 36 }, (_, i) => ({ x: ((i * 97) % 380) - 10, y: ((i * 61) % 300) - 24, l: 10 + ((i * 7) % 13) }));

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ease = Easing.bezier(0.22, 1, 0.36, 1);

const accentFor = (step: Step) => (step === 1 ? identity.water : step === 2 ? identity.marigold : identity.lime);

/** A route line that draws itself on entry: casing, glow and the line, sharing one progress value. */
function DrawnRoute({ d, progress, width }: { d: string; progress: { value: number }; width: number }) {
  const animated = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - progress.value) }));
  const common = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeDasharray: [LEN, LEN], animatedProps: animated };
  return (
    <G>
      <AnimatedPath {...common} stroke={identity.skyTop} strokeWidth={width + 7} />
      <AnimatedPath {...common} stroke={identity.limeGlow} strokeWidth={width + 12} />
      <AnimatedPath {...common} stroke={identity.lime} strokeWidth={width} />
    </G>
  );
}

function wave(cx: number, cy: number, dy: number, r: number): string {
  const half = Math.sqrt(Math.max(r * r - dy * dy, 0)) * 0.78;
  const b = (half * 2) / 4;
  return `M${cx - half} ${cy + dy} q${b / 2} -5 ${b} 0 t${b} 0 t${b} 0 t${b} 0`;
}

function Phone({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Rect x={x - 8} y={y - 13} width={16} height={26} rx={4} fill={identity.skyMid} stroke={identity.marigold} strokeWidth={2} />
      <Line x1={x - 2.5} y1={y - 8} x2={x + 2.5} y2={y - 8} stroke={identity.marigold} strokeWidth={1.6} strokeLinecap="round" />
    </G>
  );
}

function Chip({ label, note, color, delay }: { label: string; note?: string; color: string; delay: number }) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(380).delay(delay)} style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <View>
        <AppText variant="label" style={[styles.chipLabel, { color: identity.text }]}>
          {label}
        </AppText>
        {note ? (
          <AppText variant="meta" style={[styles.chipNote, { color: identity.textSubtle }]}>
            {note}
          </AppText>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * First-run story scene (DESIGN_VISION appendix B): one full-bleed night map per step, drawn in the
 * product's own language so it reads with motion off. 1: a flood report on the usual road (dashed
 * ring, Unverified). 2: two devices agree (double ring, Corroborated). 3: the water has risen, the
 * usual road is blocked and the line bends around it. The route draws once on entry; nothing loops.
 */
export function StoryScene({ step, width, height }: { step: Step; width: number; height: number }) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    progress.value = reduce ? 1 : withDelay(200, withTiming(1, { duration: 1200, easing: ease }));
  }, [progress, reduce]);

  const k = Math.max(width / VB_W, height / VB_H);
  const ox = (width - VB_W * k) / 2;
  const oy = (height - VB_H * k) / 2;
  const px = (x: number) => ox + x * k;
  const py = (y: number) => oy + y * k;
  const r = FLOOD_R[step];
  const ring = RING * k;
  const accent = accentFor(step);
  const delay = reduce ? 0 : 650;

  return (
    <View style={{ width, height }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="destGlow" cx={DEST.x} cy={DEST.y} r={150} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={identity.lime} stopOpacity={0.22} />
            <Stop offset="1" stopColor={identity.lime} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="floodFill" cx={FLOOD.x} cy={FLOOD.y} r={r} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={identity.water} stopOpacity={0.38} />
            <Stop offset="1" stopColor={identity.water} stopOpacity={0.06} />
          </RadialGradient>
          <RadialGradient id="horizon" cx={40} cy={440} r={260} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={identity.marigold} stopOpacity={0.2} />
            <Stop offset="1" stopColor={identity.marigold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={-200} y={-200} width={VB_W + 400} height={VB_H + 400} fill="url(#horizon)" />
        <Rect x={-200} y={-200} width={VB_W + 400} height={VB_H + 400} fill="url(#destGlow)" />
        {RAIN.map((d, i) => (
          <Line key={i} x1={d.x} y1={d.y} x2={d.x - d.l * 0.25} y2={d.y + d.l} stroke={identity.rain} strokeWidth={1} strokeLinecap="round" />
        ))}
        {STREETS.map((d, i) => (
          <Path key={i} d={d} stroke={i % 2 === 0 ? identity.roadMajor : identity.road} strokeWidth={i % 2 === 0 ? 7 : 5} fill="none" strokeLinecap="round" />
        ))}
        {/* The flood: a soft pool with a dotted contour and wave lines, wider at every step. */}
        <Circle cx={FLOOD.x} cy={FLOOD.y} r={r} fill="url(#floodFill)" stroke={identity.water} strokeWidth={1.4} strokeDasharray={[2, 5]} strokeLinecap="round" />
        <Path d={wave(FLOOD.x, FLOOD.y, r * 0.52, r)} stroke={identity.water} strokeOpacity={0.7} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <Path d={wave(FLOOD.x, FLOOD.y, r * 0.74, r)} stroke={identity.water} strokeOpacity={0.4} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        {step === 3 ? (
          <G>
            <Path d={USUAL} stroke={identity.textSubtle} strokeOpacity={0.55} strokeWidth={5} strokeDasharray={[2, 9]} strokeLinecap="round" fill="none" />
            <Path d={BLOCKED} stroke={identity.coral} strokeWidth={6} strokeDasharray={[9, 6]} strokeLinecap="butt" fill="none" />
            <DrawnRoute d={DETOUR} progress={progress} width={7} />
          </G>
        ) : (
          <DrawnRoute d={USUAL} progress={progress} width={7} />
        )}
        {step === 2 ? (
          <G>
            <Line x1={104} y1={206} x2={FLOOD.x - 26} y2={FLOOD.y - 22} stroke={identity.marigold} strokeWidth={1.8} strokeDasharray={[2, 5]} strokeLinecap="round" />
            <Line x1={284} y1={296} x2={FLOOD.x + 24} y2={FLOOD.y + 20} stroke={identity.marigold} strokeWidth={1.8} strokeDasharray={[2, 5]} strokeLinecap="round" />
            <Phone x={104} y={206} />
            <Phone x={284} y={296} />
          </G>
        ) : null}
        <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={9} fill={identity.skyMid} stroke={identity.text} strokeWidth={3.5} />
        <Circle cx={DEST.x} cy={DEST.y} r={17} fill={identity.limeGlow} />
        <Rect x={DEST.x - 8} y={DEST.y - 8} width={16} height={16} rx={4} fill={identity.text} transform={`rotate(45 ${DEST.x} ${DEST.y})`} />
      </Svg>

      <Animated.View
        entering={reduce ? undefined : springEntry(ZoomIn.delay(delay + 250))}
        style={{ position: 'absolute', left: px(FLOOD.x) - ring / 2, top: py(FLOOD.y) - ring / 2, width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={StyleSheet.absoluteFill}>
          <Svg width={ring} height={ring} viewBox={`0 0 ${RING} ${RING}`}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 3} fill={identity.skyMid} stroke={identity.marigold} strokeWidth={2.6} strokeDasharray={step === 1 ? [6, 5] : undefined} />
            {step > 1 ? <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 9} fill="none" stroke={identity.marigold} strokeWidth={2} /> : null}
          </Svg>
        </View>
        <View style={[StyleSheet.absoluteFill, styles.glyph]}>
          <IncidentGlyph type="flood" size={ring * 0.44} color={identity.text} />
        </View>
      </Animated.View>

      <View style={[styles.chipAnchor, { left: px(FLOOD.x) - 120, top: py(FLOOD.y + r + 12) }]} pointerEvents="none">
        {step === 3 ? (
          <Chip label={t('notViable')} color={identity.coral} delay={delay + 500} />
        ) : step === 2 ? (
          <Chip label={t('statusCorroborated', { n: 2 })} note={t('storyNote2')} color={identity.marigold} delay={delay + 500} />
        ) : (
          <Chip label={t('statusUnverified')} note={t('storyNote1')} color={identity.marigold} delay={delay + 500} />
        )}
      </View>
      {step === 3 ? (
        <View style={[styles.chipAnchor, { left: px(150) - 120, top: py(112) }]} pointerEvents="none">
          <Chip label={t('recommended')} note={t('storyNote3')} color={accent} delay={delay + 900} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipAnchor: { position: 'absolute', width: 240, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    borderWidth: hairline,
    borderColor: identity.glassEdge,
    backgroundColor: identity.skyMid,
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  chipDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.chip },
  chipLabel: { fontFamily: fontFamily.semibold },
  chipNote: { fontFamily: fontFamily.medium },
});
