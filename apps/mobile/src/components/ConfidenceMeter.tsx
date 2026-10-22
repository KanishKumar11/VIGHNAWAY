import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Confidence } from '@vighnaway/contracts';
import { t } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { createStyles, fontFamily, motion, radius, spacing, useColors } from '@/theme';
import { AppText } from './AppText';

const filled: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const word: Record<Confidence, string> = { high: t('confidenceHigh'), medium: t('confidenceMedium'), low: t('confidenceLow') };

/** Three segments plus the word High, Medium or Low. Never a percentage. */
export function ConfidenceMeter({ confidence, showCaption }: { confidence: Confidence; showCaption?: boolean }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const n = filled[confidence];
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={t('confidenceLabel', { level: word[confidence] })}>
      <View style={styles.row}>
        <View style={styles.segments}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={`${confidence}-${i}`}
              entering={reduce || i >= n ? undefined : FadeIn.duration(motion.statusUpgrade).delay(i * motion.stagger * 2)}
              style={[styles.seg, { backgroundColor: i < n ? tc.ink : tc.panelLine }]}
            />
          ))}
        </View>
        <AppText variant="meta" style={styles.word}>
          {word[confidence]}
        </AppText>
      </View>
      {showCaption ? (
        <AppText variant="label" tone="muted">
          {t('confidenceReasonsTitle')}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  wrap: { alignItems: 'flex-end', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seg: { width: spacing.md - 2, height: spacing.xxs + 2, borderRadius: radius.chip },
  word: { fontFamily: fontFamily.semibold },
}));
