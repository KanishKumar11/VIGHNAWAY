import { useEffect, useState } from 'react';
import { Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { useSettings } from '@/stores/settings';
import { createStyles, fontFamily, glow, LARGER_TEXT, hairline, layout, motion, radius, shadow, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import type { LucideIcon } from './icons';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  testID?: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** `shell`: light indicator on navy (map header). `panel`: raised white indicator on a sunken track. */
  variant?: 'shell' | 'panel';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Compact height for the floating map header. */
  dense?: boolean;
}

/**
 * Single-row segmented control with a sliding indicator (DESIGN.md 11.2: selected chips slide a
 * shared indicator). Equal-width segments, so only translateX animates. Icons drop out at large
 * font sizes so labels never clip.
 */
export function Segmented<T extends string>({ options, value, onChange, variant = 'panel', accessibilityLabel, style, dense }: Props<T>) {
  const reduce = useReduceMotion();
  const tc = useColors();
  const styles = useStyles();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = width > 0 ? (width - PAD * 2) / n : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    const target = index * segW;
    x.value = reduce || segW === 0 ? target : withSpring(target, motion.springSnappy);
  }, [index, segW, reduce, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shell = variant === 'shell';
  // Effective scale = system font size x the in-app Larger text setting.
  const larger = useSettings((st) => st.largerText);
  const scale = fontScale * (larger ? LARGER_TEXT : 1);
  const showIcons = scale <= 1.2;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, shell ? [styles.trackShell, shadow('md')] : styles.trackPanel, dense && styles.dense, style]}
    >
      {segW > 0 && value !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: segW }, glow(tc.accent, 0.55), indicator]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        // The chosen segment is a solid accent pill with the onAccent label (an AA pair).
        const fg = selected ? tc.onAccent : shell ? tc.inkOnShellMuted : tc.inkMuted;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            onPress={() => {
              if (!selected) haptic.selection();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[styles.segment, dense && styles.segmentDense]}
          >
            {Icon && showIcons ? <Icon size={16} color={fg} strokeWidth={2} /> : null}
            <AppText variant="meta" numberOfLines={scale > 1.2 ? 2 : 1} style={[styles.label, { color: fg }, selected && styles.labelSelected]}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const PAD = spacing.xxs;

const useStyles = createStyles((tc) => ({
  track: { flexDirection: 'row', padding: PAD, borderRadius: radius.button + PAD, minHeight: layout.minTouch },
  dense: { minHeight: layout.minTouch - PAD },
  trackShell: { backgroundColor: tc.shellOverlay, borderWidth: hairline, borderColor: tc.panelLine },
  trackPanel: { backgroundColor: tc.panelSunken },
  indicator: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.button, backgroundColor: tc.accent },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs + 1,
    paddingHorizontal: spacing.xxs,
    minHeight: layout.minTouch - PAD * 2,
  },
  segmentDense: { minHeight: layout.minTouch - PAD * 3 },
  label: { flexShrink: 1, textAlign: 'center' },
  labelSelected: { fontFamily: fontFamily.bold },
}));
