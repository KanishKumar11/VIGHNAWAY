import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, fontFamily, glow, hairline, layout, radius, shadow, spacing, useColors, type ThemeColors } from '@/theme';
import { AppText, type TextTone } from './AppText';
import type { LucideIcon } from './icons';
import { PressScale } from './motion';

export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'onShell';

/** Primary = the solid accent with its onAccent label (an AA pair), lit from below; the rest stay quiet. */
const palette = (tc: ThemeColors, kind: ButtonKind): { bg: string; fg: string; tone: TextTone } => {
  switch (kind) {
    case 'secondary':
      return { bg: tc.panel, fg: tc.ink, tone: 'ink' };
    case 'danger':
      return { bg: tc.dangerSurface, fg: tc.dangerInk, tone: 'danger' };
    case 'onShell':
      return { bg: tc.shellOverlay, fg: tc.inkOnShell, tone: 'onShell' };
    default:
      return { bg: 'transparent', fg: tc.ink, tone: 'ink' };
  }
};

interface Props {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  /** Square icon button; `label` becomes the accessibility label. */
  iconOnly?: boolean;
  trailingIcon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  trailing?: ReactNode;
}

/**
 * Press: scale 0.97 on the snappy spring with a light haptic for primary actions (DESIGN.md 6, 11.2).
 * The primary button is the solid accent with a glow in its own colour; no gradients anywhere.
 */
export function Button({ label, onPress, kind = 'primary', icon: Icon, iconOnly, trailingIcon: Trailing, disabled, loading, accessibilityHint, style, testID, trailing }: Props) {
  const tc = useColors();
  const styles = useStyles();
  const primary = kind === 'primary';
  const p = primary ? { bg: tc.accent, fg: tc.onAccent, tone: 'ink' as TextTone } : palette(tc, kind);
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      haptic={primary ? 'light' : null}
      onPress={onPress}
      style={[
        styles.base,
        iconOnly && styles.iconOnly,
        { backgroundColor: p.bg, opacity: disabled ? 0.5 : 1 },
        primary && !disabled && glow(tc.accent, 0.9),
        kind === 'secondary' && [styles.secondary, shadow('sm')],
        kind === 'onShell' && styles.outlineShell,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={p.fg} /> : Icon ? <Icon size={20} color={p.fg} strokeWidth={2.25} /> : null}
        {iconOnly ? null : (
          <AppText variant="body" control tone={p.tone} style={[styles.label, { color: p.fg }]} numberOfLines={2}>
            {label}
          </AppText>
        )}
        {Trailing && !iconOnly ? <Trailing size={18} color={p.fg} strokeWidth={2.25} /> : null}
        {trailing}
      </View>
    </PressScale>
  );
}

const useStyles = createStyles((tc) => ({
  base: {
    minHeight: layout.minTouch,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconOnly: { width: layout.minTouch, paddingHorizontal: 0, alignItems: 'center' },
  // A soft edge in the page's blue, not the heavy 3:1 outline: the label carries the meaning.
  secondary: { borderWidth: hairline, borderColor: tc.panelLine },
  outlineShell: { borderWidth: hairline, borderColor: tc.shellHairlineStrong },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { textAlign: 'center', flexShrink: 1, fontFamily: fontFamily.semibold },
}));
