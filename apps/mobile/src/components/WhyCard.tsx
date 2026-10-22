import { View } from 'react-native';
import type { RouteEvaluation } from '@vighnaway/contracts';
import { t } from '@/i18n/en';
import { confidenceReasonsOf, reasonOf, recheckOf, tradeOffOf } from '@/i18n/engineText';
import { createStyles, hairline, radius, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import { Hourglass, RefreshCw, Route, type LucideIcon } from './icons';

function Line({ icon: Icon, label, value, last }: { icon: LucideIcon; label: string; value: string; last?: boolean }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.rail}>
        <View style={styles.iconTile}>
          <Icon size={16} color={tc.inkMuted} strokeWidth={2} />
        </View>
        {last ? null : <View style={styles.connector} />}
      </View>
      <View style={styles.texts}>
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

/**
 * Why this route: Avoids, Trade-off, Re-check if; always this order and shape. A section of the
 * sheet with a quiet heading and a rail, not a card (DESIGN_VISION 3.1).
 */
export function WhyCard({ route }: { route: RouteEvaluation }) {
  const styles = useStyles();
  const reasons = confidenceReasonsOf(route);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <AppText variant="label" tone="muted" accessibilityRole="header">
          {t('whyTitle')}
        </AppText>
        <View style={styles.headRule} />
      </View>
      <View>
        <Line icon={Route} label={t('whyAvoids')} value={reasonOf(route)} />
        <Line icon={Hourglass} label={t('whyTradeOff')} value={tradeOffOf(route) || '—'} />
        <Line icon={RefreshCw} label={t('whyRecheck')} value={recheckOf(route)} last />
      </View>
      {route.lighting ? (
        <AppText variant="meta" tone="muted" testID="why-preference">
          {t('preferenceLit')}
        </AppText>
      ) : null}
      {reasons.length ? (
        <View style={styles.reasons}>
          <AppText variant="label" tone="muted">
            {t('confidenceReasonsTitle')}
          </AppText>
          {reasons.map((r) => (
            <View key={r} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <AppText variant="meta" style={styles.flex}>
                {r}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const TILE = spacing.xl;

const useStyles = createStyles((tc) => ({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headRule: { flex: 1, height: hairline, backgroundColor: tc.panelHairline },
  line: { flexDirection: 'row', gap: spacing.sm },
  rail: { alignItems: 'center', width: TILE },
  iconTile: { width: TILE, height: TILE, alignItems: 'center', justifyContent: 'center' },
  connector: { flex: 1, width: hairline * 2, backgroundColor: tc.panelLine, marginVertical: spacing.xxs },
  texts: { flex: 1, gap: 2, paddingBottom: spacing.md, paddingTop: spacing.xxs },
  reasons: { gap: spacing.xxs, paddingTop: spacing.sm, borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  bullet: { width: spacing.xxs + 1, height: spacing.xxs + 1, borderRadius: radius.chip, backgroundColor: tc.inkMuted, marginTop: spacing.xs - 1 },
  flex: { flex: 1 },
}));
