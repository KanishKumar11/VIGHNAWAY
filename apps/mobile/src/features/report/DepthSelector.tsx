import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';
import { humanSilhouette as SILHOUETTE } from '@vighnaway/tokens';
import { AppText } from '@/components/AppText';
import { MapField } from '@/components/MapField';
import { t, type StringKey } from '@/i18n/en';
import { haptic } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { createStyles, fontFamily, hairline, layout, motion, radius, spacing, useColors } from '@/theme';
import type { ReportDraft } from './validation';

export type DepthValue = NonNullable<ReportDraft['depth']>;

/** Options top to bottom, as they read against the figure. `level` is the water height as a fraction of the figure's height, from its feet (ankle bone, knee and belt on a standing adult). */
const OPTIONS: { value: DepthValue; label: StringKey; level: number }[] = [
  { value: 'waist', label: 'depthWaist', level: 0.56 },
  { value: 'knee', label: 'depthKnee', level: 0.28 },
  { value: 'ankle', label: 'depthAnkle', level: 0.07 },
  { value: 'not_sure', label: 'depthNotSure', level: 0 },
];

const FIG_W = spacing.xl * 3 + spacing.xs;
const FIG_H = spacing.xl * 5 + spacing.xs;
/** Feet sit this far above the tile's bottom edge. */
const GROUND = spacing.sm;
/** The silhouette stands this tall, its feet on the ground line and a little air above its head. */
const FIGURE_H = FIG_H - GROUND - spacing.xs;

/**
 * Flood depth as a water level on a standing human silhouette (DESIGN.md 11.5): the water rises to
 * the ankle, knee or waist with a spring; "Not sure" drains it and marks the figure with a question.
 */
export function DepthSelector({ value, onChange }: { value: ReportDraft['depth']; onChange: (v: DepthValue) => void }) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  const level = OPTIONS.find((o) => o.value === value)?.level ?? 0;
  const target = level > 0 ? FIG_H - (GROUND + FIGURE_H * level) : FIG_H;
  const y = useSharedValue(FIG_H);
  const [unsure, setUnsure] = useState(value === 'not_sure');
  useEffect(() => {
    y.value = reduce ? target : withSpring(target, motion.springSoft);
    setUnsure(value === 'not_sure');
  }, [target, reduce, value, y]);
  const water = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const q = useSharedValue(value === 'not_sure' ? 1 : 0);
  useEffect(() => {
    q.value = reduce ? (unsure ? 1 : 0) : withTiming(unsure ? 1 : 0, { duration: motion.statusUpgrade });
  }, [unsure, reduce, q]);
  const qStyle = useAnimatedStyle(() => ({ opacity: q.value, transform: [{ scale: 0.8 + q.value * 0.2 }] }));

  return (
    <View style={styles.wrap}>
      <View style={styles.figure} accessible={false}>
        <MapField width={FIG_W} height={FIG_H} cy={0.4} />
        <Animated.View style={[styles.water, water]}>
          <View style={styles.surface} />
        </Animated.View>
        <Svg width={FIG_W} height={FIG_H} style={StyleSheet.absoluteFill} viewBox={`0 0 ${FIG_W} ${FIG_H}`}>
          <Figure w={FIG_W} h={FIG_H} />
        </Svg>
        <Animated.View style={[styles.question, qStyle]} pointerEvents="none">
          <AppText variant="figure" tone="onShell">
            ?
          </AppText>
        </Animated.View>
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
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
              <AppText variant="body" tone={selected ? 'inverse' : 'ink'} style={selected ? styles.labelSelected : undefined}>
                {t(o.label)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The supplied human silhouette, feet on the ground line, drawn in the shell ink. */
function Figure({ w, h }: { w: number; h: number }) {
  const tc = useColors();
  const feet = h - GROUND;
  const scale = FIGURE_H / SILHOUETTE.size;
  const x = (w - SILHOUETTE.size * scale) / 2;
  const y = feet - FIGURE_H;
  return (
    <>
      <Path d={`M${spacing.xs} ${feet} H${w - spacing.xs}`} stroke={tc.inkOnShellMuted} strokeWidth={1.5} strokeDasharray={[3, 4]} />
      <G transform={`translate(${x} ${y}) scale(${scale})`}>
        <Path d={SILHOUETTE.d} fill={tc.inkOnShell} />
      </G>
    </>
  );
}

const useStyles = createStyles((tc) => ({
  wrap: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  figure: { width: FIG_W, height: FIG_H, borderRadius: radius.card, overflow: 'hidden', backgroundColor: tc.shell },
  water: { position: 'absolute', left: 0, right: 0, top: 0, height: FIG_H, backgroundColor: tc.floodProne },
  surface: { height: 2, backgroundColor: tc.floodProneSolid },
  question: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: spacing.lg + spacing.xxs,
    height: spacing.lg + spacing.xxs,
    borderRadius: radius.chip,
    backgroundColor: tc.shellOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { flex: 1, justifyContent: 'space-between', gap: spacing.xxs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: tc.panelRaised,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
  },
  optionSelected: { backgroundColor: tc.ink, borderColor: tc.ink },
  radio: { width: spacing.md + 2, height: spacing.md + 2, borderRadius: radius.chip, borderWidth: 2, borderColor: tc.panelLine, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: tc.floodProneSolid },
  radioDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.floodProneSolid },
  labelSelected: { fontFamily: fontFamily.semibold },
}));
