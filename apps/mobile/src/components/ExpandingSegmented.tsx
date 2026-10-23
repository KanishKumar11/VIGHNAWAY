import { useEffect, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { createStyles, fontFamily, hairline, layout, motion, radius, shadow, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import { easing } from './motion';
import type { LucideIcon } from './icons';

export interface ExpandingOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  testID?: string;
}

interface Props<T extends string> {
  options: ExpandingOption<T>[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Compact height for the floating map header. */
  dense?: boolean;
}

/**
 * A single-row choice where only the chosen option shows its name: the others shrink to their icon, so a long
 * label ("Two-wheeler") is never cut off. The chosen segment grows into the room the others give up. The change
 * is a short fade and width tween on the UI thread; the colour and label switch on the press itself.
 */
export function ExpandingSegmented<T extends string>({ options, value, onChange, accessibilityLabel, style, dense }: Props<T>) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const n = options.length;
  const inner = width - PAD * 2 - hairline * 2;
  const iconW = layout.minTouch;
  const selW = width > 0 ? Math.max(iconW, inner - (n - 1) * iconW) : 0;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, shadow('md'), dense && styles.dense, style]}
    >
      {options.map((o) => (
        <Segment key={o.value} option={o} selected={o.value === value} iconW={iconW} selW={selW} dense={dense} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function Segment<T extends string>({ option, selected, iconW, selW, dense, onPress }: { option: ExpandingOption<T>; selected: boolean; iconW: number; selW: number; dense?: boolean; onPress: () => void }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, { duration: motion.statusUpgrade, easing });
  }, [selected, reduce, p]);
  // Until the track is measured the chosen segment simply takes the free room (same result, no tween).
  const measured = selW > 0;
  const widthStyle = useAnimatedStyle(() => (measured ? { width: iconW + (selW - iconW) * p.value } : {}));
  const fillStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const fg = selected ? tc.onAccent : tc.inkOnShellMuted;
  const Icon = option.icon;
  return (
    <Animated.View style={[styles.cell, dense && styles.cellDense, measured ? widthStyle : selected ? styles.cellGrow : { width: iconW }]}>
      <Animated.View pointerEvents="none" style={[styles.fill, fillStyle]} />
      <Pressable
        testID={option.testID}
        onPress={() => {
          if (!selected) haptic.selection();
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{ selected }}
        style={styles.press}
      >
        <Icon size={18} color={fg} strokeWidth={2.25} />
        {selected ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.banner - 100)} style={styles.labelWrap}>
            <AppText variant="meta" control numberOfLines={1} style={[styles.label, { color: fg }]}>
              {option.label}
            </AppText>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const PAD = spacing.xxs;

const useStyles = createStyles((tc) => ({
  track: { flexDirection: 'row', padding: PAD, borderRadius: radius.button + PAD, minHeight: layout.minTouch, backgroundColor: tc.shellOverlay, borderWidth: hairline, borderColor: tc.panelLine },
  dense: { minHeight: layout.minTouch - PAD },
  cell: { minHeight: layout.minTouch - PAD * 2, overflow: 'hidden', borderRadius: radius.button },
  cellDense: { minHeight: layout.minTouch - PAD * 3 },
  cellGrow: { flex: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.button, backgroundColor: tc.accent },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs + 1, paddingHorizontal: spacing.xs },
  labelWrap: { flexShrink: 1 },
  label: { fontFamily: fontFamily.bold },
}));
