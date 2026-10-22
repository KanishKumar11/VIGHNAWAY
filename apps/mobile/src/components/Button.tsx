import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, hairline, layout, radius, spacing, useColors, type ThemeColors } from '@/theme';
import { AppText, type TextTone } from './AppText';
import type { LucideIcon } from './icons';
import { PressScale } from './motion';

export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'onShell';

/** Primary = the accent with its onAccent label (an AA pair); the rest stay quiet. Flat, no shadows. */
const palette = (tc: ThemeColors, kind: ButtonKind): { bg: string; fg: string; tone: TextTone } => {
  switch (kind) {
    case 'primary':
      return { bg: tc.accent, fg: tc.onAccent, tone: 'ink' };
    case 'secondary':
      return { bg: tc.panelRaised, fg: tc.ink, tone: 'ink' };
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

/** Press: scale 0.97 on the snappy spring with a light haptic for primary actions (DESIGN.md 6, 11.2). */
export function Button({ label, onPress, kind = 'primary', icon: Icon, iconOnly, trailingIcon: Trailing, disabled, loading, accessibilityHint, style, testID, trailing }: Props) {
  const tc = useColors();
  const styles = useStyles();
  const p = palette(tc, kind);
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      haptic={kind === 'primary' ? 'light' : null}
      onPress={onPress}
      style={[
        styles.base,
        iconOnly && styles.iconOnly,
        { backgroundColor: p.bg, opacity: disabled ? 0.5 : 1 },
        kind === 'secondary' && styles.outline,
        kind === 'onShell' && styles.outlineShell,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={p.fg} /> : Icon ? <Icon size={20} color={p.fg} strokeWidth={2} /> : null}
        {iconOnly ? null : (
          <AppText variant="title" tone={p.tone} style={[styles.label, { color: p.fg }]} numberOfLines={2}>
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
    minHeight: layout.minTouch + spacing.xxs,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
  },
  iconOnly: { width: layout.minTouch + spacing.xxs, paddingHorizontal: 0, alignItems: 'center' },
  // Control boundary at 3:1 against the panel (DESIGN_VISION 5.1); no shadow.
  outline: { borderWidth: 1, borderColor: tc.controlBorder },
  outlineShell: { borderWidth: hairline, borderColor: tc.shellHairlineStrong },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { textAlign: 'center', flexShrink: 1 },
}));
