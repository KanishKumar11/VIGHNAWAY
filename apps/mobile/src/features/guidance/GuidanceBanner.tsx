import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerDownLeft, CornerDownRight, CornerUpLeft, CornerUpRight, Flag, TriangleAlert, Undo2, type LucideIcon } from '@/components/icons';
import { fmtDistance } from '@/i18n/format';
import { t } from '@/i18n/en';
import { useLanguage } from '@/i18n/useLanguage';
import { useGuidance } from '@/stores/guidance';
import { useTrip } from '@/stores/trip';
import { createStyles, hairline, layout, radius, shadow, spacing, useColors } from '@/theme';
import { guidanceEnabled } from './useGuidanceEngine';
import type { TurnKind } from './guide';
import { instructionText, maneuverText } from './text';

const ICON: Record<TurnKind, LucideIcon> = {
  depart: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  sharp_left: CornerDownLeft,
  sharp_right: CornerDownRight,
  uturn: Undo2,
  arrive: Flag,
};

/** Rounds what the banner shows: 10 m steps near, 50 m further out, so the number does not flicker. */
const shownM = (m: number): number => (m >= 1000 ? Math.round(m / 100) * 100 : m >= 200 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10));

/**
 * The next turn during a trip: an arrow, how far, and the instruction ("Turn left onto Ram Tirath
 * Road"), with the one after it when it follows closely. Off the planned road it says so instead.
 */
export function GuidanceBanner() {
  useLanguage();
  const tc = useColors();
  const styles = useStyles();
  const path = useGuidance((s) => s.path);
  const progress = useGuidance((s) => s.progress);
  const tripRunning = useTrip((s) => s.mode === 'en_route');
  if (!tripRunning || !path || !progress || !guidanceEnabled()) return null;

  const { next, nextDistM, then, offRoute } = progress;
  const text = offRoute ? t('guideOffRoute') : instructionText(next, 0, path);
  const Icon = offRoute ? TriangleAlert : ICON[next.kind];
  const a11y = t('guideBannerA11y', { text: offRoute ? text : instructionText(next, shownM(nextDistM), path) });
  return (
    <View style={[styles.card, shadow('md')]} accessible accessibilityRole="text" accessibilityLabel={a11y} accessibilityLiveRegion="polite" testID="guidance-banner">
      <View style={[styles.icon, offRoute && styles.iconWarn]}>
        <Icon size={28} color={offRoute ? tc.warnInk : tc.onAccent} strokeWidth={2.5} />
      </View>
      <View style={styles.body}>
        {!offRoute && next.kind !== 'arrive' ? (
          <AppText variant="title" control numberOfLines={1} testID="guidance-distance">
            {fmtDistance(shownM(nextDistM))}
          </AppText>
        ) : null}
        <AppText variant="body" control tone={offRoute ? 'warn' : 'ink'} numberOfLines={2} style={styles.text} testID="guidance-text">
          {text}
        </AppText>
        {!offRoute && then ? (
          <AppText variant="meta" control tone="muted" numberOfLines={1}>
            {t('guideThen', { turn: maneuverText(then, path).replace(/^./, (c) => c.toLowerCase()) })}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.panel,
    borderWidth: hairline,
    borderColor: tc.panelLine,
  },
  icon: { width: layout.minTouch + spacing.xs, height: layout.minTouch + spacing.xs, borderRadius: radius.button, backgroundColor: tc.accent, alignItems: 'center', justifyContent: 'center' },
  iconWarn: { backgroundColor: tc.warnSurface },
  body: { flex: 1, minWidth: 0 },
  text: { flexShrink: 1 },
}));
