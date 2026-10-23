import { View } from 'react-native';
import { haptic } from '@/lib/feedback';
import { createStyles, fontFamily, hairline, layout, radius, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import type { LucideIcon } from './icons';
import { PressScale } from './motion';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  testID?: string;
}

/**
 * A single choice laid out as a grid of large tiles (two across by default), for options whose labels are too long
 * for one segmented row: each tile shows its whole name, so nothing is cut off with an ellipsis.
 */
export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.grid}>
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        const fg = selected ? tc.onAccent : tc.ink;
        return (
          <PressScale
            key={o.value}
            haptic={null}
            scaleTo={0.97}
            onPress={() => {
              if (selected) return;
              haptic.selection();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            testID={o.testID}
            style={[styles.tile, selected ? styles.tileOn : styles.tileOff]}
          >
            {Icon ? <Icon size={20} color={fg} strokeWidth={2.25} /> : null}
            <AppText control style={[styles.label, { color: fg }]} numberOfLines={2}>
              {o.label}
            </AppText>
          </PressScale>
        );
      })}
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: layout.minTouch + spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    borderWidth: hairline,
  },
  tileOn: { backgroundColor: tc.accent, borderColor: tc.accent },
  tileOff: { backgroundColor: tc.panelSunken, borderColor: tc.panelLine },
  label: { flex: 1, fontFamily: fontFamily.medium },
}));
