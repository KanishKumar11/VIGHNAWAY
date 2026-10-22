import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useReduceMotion } from '@/lib/motion';
import { useToast } from '@/stores/toast';
import { createStyles, hairline, motion, radius, shadow, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import { springEntry } from './motion';
import { CircleCheck, Info, TriangleAlert } from './icons';

/** Calm toast that springs in from the top. Rendered by the screen that owns the area (Navigate and Report). */
export function ToastHost({ top }: { top: number }) {
  const tc = useColors();
  const styles = useStyles();
  const toast = useToast((s) => s.toast);
  const reduce = useReduceMotion();
  if (!toast) return null;
  const warn = toast.tone === 'warn';
  const Icon = warn ? TriangleAlert : toast.tone === 'positive' ? CircleCheck : Info;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <Animated.View
        key={toast.id}
        entering={reduce ? undefined : springEntry(FadeInUp)}
        exiting={reduce ? undefined : FadeOutUp.duration(motion.banner)}
        style={[styles.toast, warn && styles.warn, shadow('md')]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <View style={[styles.icon, warn ? styles.iconWarn : toast.tone === 'positive' ? styles.iconPositive : styles.iconNeutral]}>
          <Icon size={16} color={warn ? tc.warnInk : toast.tone === 'positive' ? tc.routeRecommended : tc.inkOnShell} strokeWidth={2.25} />
        </View>
        <AppText tone={warn ? 'warn' : 'onShell'} style={styles.text}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: tc.shellOverlay,
    borderRadius: radius.card,
    borderWidth: hairline,
    borderColor: tc.shellHairlineStrong,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  warn: { backgroundColor: tc.warnSurface, borderColor: tc.warnSoft },
  icon: { width: spacing.xl - spacing.xxs, height: spacing.xl - spacing.xxs, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  iconWarn: { backgroundColor: tc.warnSoft },
  iconPositive: { backgroundColor: tc.tealSoft },
  iconNeutral: { backgroundColor: tc.shellRaised },
  text: { flexShrink: 1 },
}));
