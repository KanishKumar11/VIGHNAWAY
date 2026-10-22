import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';
import { humanSilhouette as SILHOUETTE } from '@vighnaway/tokens';
import { AppText } from '@/components/AppText';
import { t, type StringKey } from '@/i18n/en';
import { haptic } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { fontFamily, glow, hairline, layout, motion, radius, shadow, spacing, useColors, withAlpha } from '@/theme';
import type { ReportDraft } from './validation';

export type DepthValue = NonNullable<ReportDraft['depth']>;

/**
 * Options top to bottom, as they read against the figure. `level` is the water height as a fraction
 * of the figure's height, from its feet (ankle bone, knee and belt on a standing adult); `bar` is the
 * same depth as a fraction of the little gauge beside the label.
 */
const OPTIONS: { value: DepthValue; label: StringKey; level: number; bar: number }[] = [
  { value: 'waist', label: 'depthWaist', level: 0.56, bar: 1 },
  { value: 'knee', label: 'depthKnee', level: 0.28, bar: 0.62 },
  { value: 'ankle', label: 'depthAnkle', level: 0.07, bar: 0.28 },
  { value: 'not_sure', label: 'depthNotSure', level: 0, bar: 0 },
];

const SCENE_W = spacing.xl * 4 + spacing.xs;
const SCENE_H = spacing.xl * 6 + spacing.xs;
/** Feet sit this far above the scene's bottom edge. */
const GROUND = spacing.md;
/** The silhouette stands this tall, its feet on the ground line and a little air above its head. */
const FIGURE_H = SCENE_H - GROUND - spacing.sm;

/** Front wave: one wavelength is the scene width, so a shift of one wavelength loops without a seam. */
const FRONT = { wavelength: SCENE_W, amp: spacing.xs - 2, ms: 2600 };
/** Back wave: shorter and slower, drifting the other way, so the two never line up. */
const BACK = { wavelength: Math.round(SCENE_W * 0.72), amp: spacing.xxs, ms: 3900 };

interface Wave {
  /** The closed shape: crest line plus the body down to the bottom. */
  fill: string;
  /** The crest line alone, for the foam stroke. */
  line: string;
  width: number;
  height: number;
}

/**
 * A sine wave as chained quadratic curves (`T` reflects the control point, so crest and trough
 * alternate). The crest line sits `amp` below the top edge so the peaks are not clipped.
 */
function wave({ wavelength, amp }: { wavelength: number; amp: number }): Wave {
  const width = SCENE_W + wavelength;
  const height = SCENE_H + amp * 2;
  const half = wavelength / 2;
  let line = `M0 ${amp} Q${wavelength / 4} ${-amp} ${half} ${amp}`;
  let x = half;
  while (x < width) {
    x += half;
    line += ` T${x} ${amp}`;
  }
  return { line, fill: `${line} L${x} ${height} L0 ${height} Z`, width: x, height };
}

const FRONT_WAVE = wave(FRONT);
const BACK_WAVE = wave(BACK);

/** One wave layer, drifting sideways forever. `dir` -1 slides left, 1 slides right. */
function WaveLayer({ shape, spec, dir, fill, foam, still }: { shape: Wave; spec: { wavelength: number; ms: number }; dir: 1 | -1; fill: string; foam: string | null; still: boolean }) {
  const x = useSharedValue(dir === -1 ? 0 : -spec.wavelength);
  useEffect(() => {
    if (still) {
      x.value = -spec.wavelength / 2;
      return;
    }
    x.value = dir === -1 ? 0 : -spec.wavelength;
    x.value = withRepeat(withTiming(dir === -1 ? -spec.wavelength : 0, { duration: spec.ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [still, dir, spec.wavelength, spec.ms, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.layer, { width: shape.width, height: shape.height }, style]}>
      <Svg width={shape.width} height={shape.height} viewBox={`0 0 ${shape.width} ${shape.height}`}>
        <Path d={shape.fill} fill={fill} />
        {foam ? <Path d={shape.line} fill="none" stroke={foam} strokeWidth={2} strokeLinecap="round" /> : null}
      </Svg>
    </Animated.View>
  );
}

/**
 * Flood depth as a rising water level on a standing human silhouette (DESIGN.md 11.5). The surface is
 * two waves that never stop moving; tapping Ankle, Knee or Waist lifts the whole sheet of water to
 * that height on a soft spring. "Not sure" lets it settle at the feet and marks the figure with a
 * question. With reduce motion on, the waves hold still and the level jumps.
 */
export function DepthSelector({ value, onChange }: { value: ReportDraft['depth']; onChange: (v: DepthValue) => void }) {
  const tc = useColors();
  const reduce = useReduceMotion();
  const level = OPTIONS.find((o) => o.value === value)?.level ?? 0;
  const target = SCENE_H - GROUND - FIGURE_H * level;
  const y = useSharedValue(SCENE_H);
  const bob = useSharedValue(0);
  useEffect(() => {
    y.value = reduce ? target : withSpring(target, motion.springSoft);
  }, [target, reduce, y]);
  // The whole sheet of water rocks a couple of dp, slowly, so the level never looks frozen.
  useEffect(() => {
    if (reduce) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(withSequence(withTiming(spacing.xxs / 2, { duration: 1700, easing: Easing.inOut(Easing.sin) }), withTiming(-spacing.xxs / 2, { duration: 1700, easing: Easing.inOut(Easing.sin) })), -1, true);
    return () => cancelAnimation(bob);
  }, [reduce, bob]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value + bob.value }] }));
  const backSheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - bob.value - spacing.xxs / 2 }] }));
  const unsure = value === 'not_sure';

  return (
    <View style={styles.wrap}>
      <View style={[styles.scene, { backgroundColor: tc.panelSunken, borderColor: tc.panelLine }]} accessible={false}>
        <Animated.View pointerEvents="none" style={[styles.sheet, backSheet]}>
          <WaveLayer shape={BACK_WAVE} spec={BACK} dir={1} fill={withAlpha(tc.floodProneSolid, 0.34)} foam={null} still={reduce} />
        </Animated.View>
        <Svg width={SCENE_W} height={SCENE_H} style={StyleSheet.absoluteFill} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
          <Path d={`M${spacing.xs} ${SCENE_H - GROUND} H${SCENE_W - spacing.xs}`} stroke={tc.inkMuted} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray={[3, 4]} />
          <Figure />
        </Svg>
        <Animated.View pointerEvents="none" style={[styles.sheet, sheet]}>
          <WaveLayer shape={FRONT_WAVE} spec={FRONT} dir={-1} fill={withAlpha(tc.floodProneSolid, 0.5)} foam={withAlpha(tc.white, 0.7)} still={reduce} />
        </Animated.View>
        {unsure ? (
          <View style={[styles.question, { backgroundColor: tc.panel, borderColor: tc.panelHairline }]} pointerEvents="none">
            <AppText variant="figure">?</AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={t('depthLabel')}>
        {OPTIONS.map((o) => {
          const selected = value === o.value;
          return (
            <Pressable
              key={o.value}
              testID={`depth-${o.value}`}
              onPress={() => {
                if (!selected) haptic.selection();
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(o.label)}
              style={[styles.option, { backgroundColor: selected ? tc.accent : tc.panel, borderColor: selected ? tc.accent : tc.panelLine }, selected ? glow(tc.accent, 0.5) : shadow('sm')]}
            >
              <Gauge fraction={o.bar} selected={selected} />
              <AppText variant="body" style={[styles.label, { color: selected ? tc.onAccent : tc.ink }, selected && styles.labelSelected]}>
                {t(o.label)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A tiny upright gauge that fills from the bottom in step with the depth, in the label's row. */
function Gauge({ fraction, selected }: { fraction: number; selected: boolean }) {
  const tc = useColors();
  const track = selected ? withAlpha(tc.onAccent, 0.28) : tc.panelSunken;
  const fill = selected ? tc.onAccent : tc.floodProneSolid;
  return (
    <View style={[styles.gauge, { backgroundColor: track }]}>
      <View style={[styles.gaugeFill, { height: `${Math.round(fraction * 100)}%`, backgroundColor: fill }]} />
    </View>
  );
}

/** The supplied human silhouette, feet on the ground line. */
function Figure() {
  const tc = useColors();
  const feet = SCENE_H - GROUND;
  const scale = FIGURE_H / SILHOUETTE.size;
  const x = (SCENE_W - SILHOUETTE.size * scale) / 2;
  const y = feet - FIGURE_H;
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d={SILHOUETTE.d} fill={tc.ink} />
    </G>
  );
}

const GAUGE_W = spacing.xs;
const GAUGE_H = spacing.lg - spacing.xxs;

// Colours come from the theme at render time; this sheet holds only sizes, which never change.
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  scene: { width: SCENE_W, height: SCENE_H, borderRadius: radius.card, overflow: 'hidden', borderWidth: hairline },
  // The sheet's top edge is the wave's centre line, so its translateY is the water level.
  sheet: { position: 'absolute', left: 0, top: -FRONT.amp, width: SCENE_W, height: SCENE_H + FRONT.amp * 2 },
  layer: { position: 'absolute', left: 0, top: 0 },
  question: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: spacing.lg + spacing.xxs,
    height: spacing.lg + spacing.xxs,
    borderRadius: radius.chip,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flex: 1, justifyContent: 'space-between', gap: spacing.xs },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch - spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
    borderWidth: hairline,
  },
  label: { flex: 1, fontFamily: fontFamily.medium },
  labelSelected: { fontFamily: fontFamily.bold },
  gauge: { width: GAUGE_W, height: GAUGE_H, borderRadius: radius.chip, overflow: 'hidden', justifyContent: 'flex-end' },
  gaugeFill: { width: GAUGE_W, borderRadius: radius.chip },
});
