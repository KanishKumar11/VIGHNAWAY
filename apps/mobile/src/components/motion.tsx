/**
 * Motion primitives. Motion only on change (DESIGN_VISION 9): presses, entrances, the ETA roll.
 * Nothing loops. Everything animates transform or opacity on the UI thread with Reanimated and
 * becomes an instant state change when reduce motion is on.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp, FadeOutDown, FadeOutUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic as hapticFx } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { splitNumberRuns } from '@/lib/geometry';
import { createStyles, easeOut, motion, radius, useColors } from '@/theme';
import { AppText, type AppTextProps } from './AppText';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const easing = Easing.bezier(...easeOut);

/**
 * Reanimated's web layer pins elements with custom keyframes (withInitialValues, springify) to an
 * absolute position after they run, so the browser preview uses the preset curves instead. Native
 * behaviour is unchanged.
 */
const presetOnly = Platform.OS === 'web';

/** Entrance for list items: fade + 8 px rise, staggered by motion.stagger (instant with reduce motion). */
export function enterUp(index = 0, reduce = false) {
  if (reduce) return undefined;
  const base = FadeInDown.duration(320).delay(index * motion.stagger).easing(easing);
  return presetOnly ? base : base.withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] });
}

type SpringableEntry = { springify: () => SpringableEntry; damping: (n: number) => SpringableEntry; stiffness: (n: number) => SpringableEntry; duration: (n: number) => SpringableEntry; easing: (e: typeof easing) => SpringableEntry };

/** A preset entrance on a spring (`springSoft` or `springSnappy`); eased on the web preview. */
export function springEntry<T>(preset: T, spring: { damping: number; stiffness: number } = motion.springSoft): T {
  const p = preset as unknown as SpringableEntry;
  return (presetOnly ? p.duration(motion.banner + 100).easing(easing) : p.springify().damping(spring.damping).stiffness(spring.stiffness)) as unknown as T;
}

interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Haptic on press; null for none. */
  haptic?: 'light' | 'selection' | null;
  scaleTo?: number;
  children?: ReactNode;
}

/** Press: scale 0.97 with the snappy spring and a light haptic (DESIGN.md section 6). */
export function PressScale({ style, haptic = 'light', scaleTo = motion.buttonPressScale, onPressIn, onPressOut, onPress, children, ...rest }: PressScaleProps) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!reduce) scale.value = withSpring(scaleTo, motion.springSnappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = reduce ? 1 : withSpring(1, motion.springSnappy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) hapticFx[haptic]();
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Skeleton

/**
 * A static placeholder shape (DESIGN_VISION 11: loading is indicated without indefinite progress
 * animations). Shapes match the content they stand in for.
 */
export function SkeletonBlock({ width, height, round, style }: { width: number | `${number}%`; height: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const tc = useColors();
  return <View style={[{ width, height, borderRadius: round ? radius.chip : radius.button / 2, backgroundColor: tc.panelSunken }, style]} />;
}

// ---------------------------------------------------------------------------------------------
// Numbers

/**
 * Digit roll: each digit sits in its own clipped cell and rolls when it changes (up when the
 * number grows, down when it shrinks). Unit runs ("min", "left") render beside the digits in
 * `unitVariant`. Only the current characters are in the tree, so the text content stays exact.
 */
export function RollingText({
  value,
  variant = 'display',
  unitVariant = 'title',
  tone = 'ink',
  unitTone = 'muted',
  control,
  testID,
  style,
}: {
  value: string;
  variant?: AppTextProps['variant'];
  unitVariant?: AppTextProps['variant'];
  tone?: AppTextProps['tone'];
  unitTone?: AppTextProps['tone'];
  /** Keep the designed size whatever the phone's text size is (see AppText). */
  control?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  const prev = useRef(value);
  const firstNumber = (s: string) => Number(/\d+/.exec(s)?.[0] ?? 0);
  const up = firstNumber(value) >= firstNumber(prev.current);
  useEffect(() => {
    prev.current = value;
  }, [value]);
  const runs = splitNumberRuns(value);
  return (
    <View style={[styles.rollRow, style]} testID={testID} accessible accessibilityLabel={value}>
      {runs.map((run, ri) =>
        run.numeric ? (
          // Digits are keyed by their place from the right so "9 → 10" rolls the units digit.
          run.text.split('').map((ch, ci) => {
            const place = run.text.length - ci;
            return (
              <View key={`d${ri}-${place}`} style={styles.digitCell}>
                <Animated.View
                  key={ch}
                  entering={reduce ? undefined : (up ? FadeInDown : FadeInUp).duration(motion.statusUpgrade + 70).easing(easing)}
                  exiting={reduce ? undefined : (up ? FadeOutUp : FadeOutDown).duration(motion.statusUpgrade)}
                >
                  <AppText variant={variant} tone={tone} control={control}>
                    {ch}
                  </AppText>
                </Animated.View>
              </View>
            );
          })
        ) : (
          <AppText key={`u${ri}`} variant={unitVariant} tone={unitTone} control={control} style={styles.unit}>
            {run.text}
          </AppText>
        ),
      )}
    </View>
  );
}

const useStyles = createStyles(() => ({
  rollRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  digitCell: { overflow: 'hidden' },
  unit: { marginLeft: 2 },
}));
