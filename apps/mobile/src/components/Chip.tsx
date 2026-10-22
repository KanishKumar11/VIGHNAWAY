import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { haptic } from '@/lib/feedback';
import { createStyles, layout, radius, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import type { LucideIcon } from './icons';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  leading?: ReactNode;
  onShell?: boolean;
  large?: boolean;
  testID?: string;
  accessibilityRole?: 'button' | 'radio' | 'checkbox';
}

/** Selectable chip. Selection is shown by fill and a check of state, never by colour alone. */
export function Chip({ label, selected, onPress, icon: Icon, leading, onShell, large, testID, accessibilityRole = 'radio' }: Props) {
  const tc = useColors();
  const styles = useStyles();
  const bgColor = selected ? (onShell ? tc.inkOnShell : tc.ink) : onShell ? tc.shellRaised : tc.panel;
  const fgTone = selected ? (onShell ? 'ink' : 'inverse') : onShell ? 'onShell' : 'ink';
  const fgColor = selected ? (onShell ? tc.ink : tc.panel) : onShell ? tc.inkOnShell : tc.ink;
  const content = (
    <View
      style={[
        styles.chip,
        large && styles.large,
        { backgroundColor: bgColor, borderColor: selected ? bgColor : onShell ? tc.shellLine : tc.panelLine },
      ]}
    >
      {leading}
      {Icon ? <Icon size={large ? 22 : 16} color={fgColor} strokeWidth={2} /> : null}
      <AppText variant={large ? 'body' : 'meta'} tone={fgTone} numberOfLines={2} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={accessibilityRole === 'checkbox' ? { checked: !!selected } : { selected: !!selected }}
      hitSlop={spacing.xxs}
      style={styles.hit}
    >
      {content}
    </Pressable>
  );
}

const useStyles = createStyles(() => ({
  hit: { minHeight: layout.minTouch, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    minHeight: layout.minTouch - spacing.sm,
  },
  large: { borderRadius: radius.card, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: layout.minTouch },
  label: { flexShrink: 1 },
}));
