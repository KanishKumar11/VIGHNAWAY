import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Linking, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSimClock } from '@vighnaway/contracts';
import { buildIncidentIndex, remainingEtaS } from '@vighnaway/engine';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ModeBadge } from '@/components/EvidenceChips';
import { Phone, Play, TriangleAlert, X } from '@/components/icons';
import { PressScale } from '@/components/motion';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { beginTrip } from '@/features/trip/deviceTrip';
import { ArriveAt, StateTag } from '@/features/navigate/SheetParts';
import { t } from '@/i18n/en';
import { routeName, whatToDoNow } from '@/i18n/engineText';
import { fmtDuration } from '@/i18n/format';
import { evalContext, getGraph } from '@/lib/engine';
import { setDriveOpen } from '@/lib/speech';
import { useIncidentList } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { recommendedRoute, useTrip } from '@/stores/trip';
import { createStyles, fontFamily, hairline, layout, radius, spacing, type, useColors } from '@/theme';
import { roadsAhead } from './roads';

const DRIVE_ETA = Math.round(type.display.size * 1.5);

/**
 * Drive mode (DESIGN_VISION appendix A): a reduced composition for a glance at a mount. The ETA,
 * the road you are on and the next one, and what to do now; a route change shows as one line in
 * the warning treatment. Two columns when the phone is landscape. Exit returns to the map.
 */
export function DriveScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const scenario = useScenario((s) => s.scenario);
  const graphFile = useScenario((s) => s.graphFile);
  const profile = useSettings((s) => s.profile);
  const plan = useTrip((s) => s.plan);
  const mode = useTrip((s) => s.mode);
  const vehicle = useTrip((s) => s.vehicle);
  const banner = useTrip((s) => s.banner);
  const destinationId = useTrip((s) => s.destinationId);
  const minuteS = useSim((s) => Math.floor(s.simTimeS / 60) * 60);
  const incidents = useIncidentList();
  const graph = useMemo(() => getGraph(graphFile, profile), [graphFile, profile]);
  const rec = recommendedRoute(plan);
  const dest = placeById(scenario, destinationId);
  const enRoute = mode === 'en_route' && !!vehicle;

  useEffect(() => {
    setDriveOpen(true);
    return () => setDriveOpen(false);
  }, []);

  const etaS = useMemo(() => {
    if (enRoute && vehicle) return remainingEtaS(graph, vehicle, buildIncidentIndex(incidents), evalContext(scenario, minuteS));
    return rec ? rec.etaS + (plan?.leadInS ?? 0) : 0;
  }, [enRoute, vehicle, graph, incidents, scenario, minuteS, rec, plan]);

  const roads = useMemo(() => {
    if (enRoute && vehicle) return roadsAhead(graph, vehicle.edgeIds, vehicle.index);
    return rec ? roadsAhead(graph, rec.edgeIds) : { current: null, next: null };
  }, [enRoute, vehicle, rec, graph]);

  const noViable = !!plan?.noViableRoute;
  const next = plan ? whatToDoNow(plan, dest?.name) : t('driveNoTrip');
  const eta = rec ? fmtDuration(etaS) : '—';

  const exit = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const head = (
    <View style={styles.headRow}>
      <PressScale
        onPress={exit}
        accessibilityRole="button"
        accessibilityLabel={t('driveExitLabel')}
        haptic="selection"
        style={styles.exit}
        testID="drive-exit"
      >
        <X size={20} color={tc.ink} strokeWidth={2.25} />
        <AppText style={styles.strong}>{t('driveExit')}</AppText>
      </PressScale>
      <ModeBadge onShell={false} />
    </View>
  );

  const etaBlock = (
    <View style={styles.etaBlock} accessible accessibilityLabel={rec ? `${enRoute ? t('etaLeft', { eta }) : eta}. ${routeName(rec.name)}` : next}>
      {rec ? <StateTag kind="recommended" label={t('recommended')} /> : noViable ? <StateTag kind="critical" label={t('notViable')} /> : null}
      <AppText variant="display" style={styles.eta} numberOfLines={1} adjustsFontSizeToFit testID="drive-eta">
        {eta}
      </AppText>
      {rec ? (
        <>
          <ArriveAt clock={formatSimClock(scenario.clockStartsAt, minuteS + etaS)} />
          <AppText variant="title" numberOfLines={2}>
            {routeName(rec.name)}
          </AppText>
        </>
      ) : null}
    </View>
  );

  const roadBlock = (
    <View style={styles.roads}>
      {roads.current ? (
        <View style={styles.roadRow}>
          <AppText variant="label" tone="muted" style={styles.roadKey}>
            {t('driveNow')}
          </AppText>
          <AppText style={[styles.road, styles.flex]} numberOfLines={2} testID="drive-current-road">
            {roads.current}
          </AppText>
        </View>
      ) : null}
      {roads.next ? (
        <View style={[styles.roadRow, styles.roadDivider]}>
          <AppText variant="label" tone="muted" style={styles.roadKey}>
            {t('driveNext')}
          </AppText>
          <AppText style={[styles.road, styles.flex]} numberOfLines={2} testID="drive-next-road">
            {roads.next}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  const nowBlock = (
    <View style={styles.now}>
      <AppText variant="label" tone="muted">
        {t('whatToDoNow')}
      </AppText>
      <AppText style={styles.nowText} testID="drive-what-to-do" accessibilityLiveRegion="polite">
        {next}
      </AppText>
      {banner ? (
        <View style={[styles.change, { backgroundColor: banner.tone === 'danger' ? tc.dangerSurface : tc.warnSurface }]} accessibilityLiveRegion="polite">
          <TriangleAlert size={18} color={banner.tone === 'danger' ? tc.dangerInk : tc.warnInk} strokeWidth={2.25} />
          <AppText style={[styles.flex, { color: banner.tone === 'danger' ? tc.dangerInk : tc.warnInk }]}>{banner.message}</AppText>
        </View>
      ) : null}
    </View>
  );

  const actions = noViable ? (
    <Button label={t('driveCall')} kind="danger" icon={Phone} onPress={() => void Linking.openURL('tel:112')} testID="drive-call" />
  ) : !enRoute && rec ? (
    <Button label={t('startTrip')} icon={Play} onPress={() => void beginTrip()} testID="drive-start" />
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs, paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]} testID="drive-mode">
      <ThemedStatusBar />
      {head}
      <ScrollView contentContainerStyle={[styles.body, landscape && styles.bodyLandscape]} showsVerticalScrollIndicator={false}>
        {landscape ? (
          <>
            <View style={styles.col}>{etaBlock}</View>
            <View style={styles.col}>
              {roadBlock}
              {nowBlock}
            </View>
          </>
        ) : (
          <>
            {etaBlock}
            {roadBlock}
            {nowBlock}
          </>
        )}
      </ScrollView>
      {actions ? <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>{actions}</View> : <View style={{ height: insets.bottom + spacing.md }} />}
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.panel },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.semibold },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouch },
  exit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.md,
    marginLeft: -spacing.xs,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: tc.controlBorder,
  },
  body: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  bodyLandscape: { flexDirection: 'row', gap: spacing.xl },
  col: { flex: 1, gap: spacing.lg },
  etaBlock: { gap: spacing.xs },
  eta: { fontSize: DRIVE_ETA, lineHeight: Math.round(DRIVE_ETA * 1.08), letterSpacing: -2 },
  roads: { borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: tc.panelLine },
  roadRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingVertical: spacing.md },
  roadDivider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  roadKey: { width: spacing.xl + spacing.md },
  road: { fontFamily: fontFamily.semibold, fontSize: type.eta.size - 8, lineHeight: type.eta.lineHeight - 6 },
  now: { gap: spacing.xs },
  nowText: { fontFamily: fontFamily.semibold, fontSize: type.title.size + 4, lineHeight: type.title.lineHeight + 6 },
  change: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.card, marginTop: spacing.sm },
  actions: { paddingTop: spacing.sm },
}));
