import { formatSimClock } from '@vighnaway/contracts';
import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Activity as ActivityIcon, CircleCheck, Clock, Flag, Info, Route, TriangleAlert, type LucideIcon } from '@/components/icons';
import { Illustration } from '@/components/Illustration';
import { enterUp } from '@/components/motion';
import { Card, GUTTER, ScreenHeader } from '@/components/ui';
import { t } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { useActivity, type ActivityKind } from '@/stores/activity';
import { usePendingReports } from '@/stores/reports';
import { useScenario } from '@/stores/scenario';
import { createStyles, hairline, radius, spacing, useColors } from '@/theme';

const ICONS: Record<ActivityKind, LucideIcon> = {
  route_changed: Route,
  unchanged: Info,
  incident: ActivityIcon,
  pending_report: Clock,
  report_sent: CircleCheck,
  report_failed: TriangleAlert,
  trip: Flag,
  no_viable_route: TriangleAlert,
  warning: TriangleAlert,
};

type Tone = 'warn' | 'danger' | 'neutral';
const TONE: Record<ActivityKind, Tone> = {
  route_changed: 'warn',
  unchanged: 'neutral',
  incident: 'neutral',
  pending_report: 'neutral',
  report_sent: 'neutral',
  report_failed: 'danger',
  trip: 'neutral',
  no_viable_route: 'danger',
  warning: 'danger',
};

/** Journey-relevant changes, newest first, as a timeline on the simulation clock. */
export default function ActivityScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const entries = useActivity((s) => s.entries);
  const waiting = usePendingReports((s) => s.pending.length);
  const clockStartsAt = useScenario((s) => s.scenario.clockStartsAt);
  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View style={styles.headerBleed}>
            <ScreenHeader title={t('drawerActivity')} subtitle={entries.length ? t('activitySubtitle') : null} />
            {waiting > 0 ? (
              <View style={styles.relay}>
                <AppText tone="muted" style={styles.flex}>
                  {t('relayWaiting', { count: waiting })}
                </AppText>
                <Button label={t('relayOpen')} kind="secondary" onPress={() => router.push('/relay')} testID="activity-relay" />
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}
        ListEmptyComponent={
          <Animated.View entering={enterUp(0, reduce)}>
            <Card style={styles.empty}>
              <View style={styles.emptyArt}>
                <Illustration kind="noIncidents" size={64} />
              </View>
              <AppText variant="title" style={styles.center}>
                {t('activityEmptyTitle')}
              </AppText>
              <AppText tone="muted" style={styles.center}>
                {t('activityEmpty')}
              </AppText>
            </Card>
          </Animated.View>
        }
        renderItem={({ item, index }) => {
          const Icon = ICONS[item.kind];
          const tone = TONE[item.kind];
          const last = index === entries.length - 1;
          return (
            <Animated.View entering={enterUp(Math.min(index, 8), reduce)} style={[styles.row, index === 0 && styles.rowFirst, last && styles.rowLast]} accessible>
              <AppText variant="mono" tone="muted" style={styles.clock}>
                {formatSimClock(clockStartsAt, item.atS)}
              </AppText>
              <View style={styles.rail}>
                <View style={[styles.node, tone === 'warn' ? styles.nodeWarn : tone === 'danger' ? styles.nodeDanger : null]}>
                  <Icon size={14} color={tone === 'danger' ? tc.dangerInk : tone === 'warn' ? tc.warnInk : tc.ink} strokeWidth={2.25} />
                </View>
                {last ? null : <View style={styles.line} />}
              </View>
              <AppText style={[styles.flex, styles.text]}>{item.text}</AppText>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const NODE = spacing.xl - spacing.xxs;

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  list: {},
  headerBleed: { marginHorizontal: -GUTTER },
  relay: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.sm },
  // The timeline reads as one card: the first and last rows round its corners.
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch', paddingHorizontal: GUTTER, backgroundColor: tc.panel, borderLeftWidth: hairline, borderRightWidth: hairline, borderColor: tc.panelHairline },
  rowFirst: { paddingTop: GUTTER, borderTopWidth: hairline, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  rowLast: { paddingBottom: spacing.xxs, borderBottomWidth: hairline, borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet },
  clock: { minWidth: spacing.xl + spacing.md, paddingTop: spacing.xxs + 1 },
  rail: { width: NODE, alignItems: 'center' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.chip,
    backgroundColor: tc.panelRaised,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeWarn: { backgroundColor: tc.warnSurface, borderColor: tc.warnSurface },
  nodeDanger: { backgroundColor: tc.dangerSurface, borderColor: tc.dangerSurface },
  line: { flex: 1, width: hairline * 2, backgroundColor: tc.panelLine, marginVertical: spacing.xxs },
  text: { paddingTop: spacing.xxs, paddingBottom: spacing.lg },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  emptyArt: { width: spacing.xl * 3, height: spacing.xl * 3, borderRadius: radius.chip, backgroundColor: tc.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
}));
