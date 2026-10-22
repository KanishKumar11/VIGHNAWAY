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
import { RoundButton } from '@/components/ui';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { beginTrip } from '@/features/trip/deviceTrip';
import { StateTag } from '@/features/navigate/SheetParts';
import { t } from '@/i18n/en';
import { routeLabel, whatToDoNow } from '@/i18n/engineText';
import { fmtDuration } from '@/i18n/format';
import { evalContext, getGraph } from '@/lib/engine';
import { setDriveOpen } from '@/lib/speech';
import { useIncidentList } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { recommendedRoute, useTrip } from '@/stores/trip';
import { createStyles, fontFamily, glow, hairline, layout, radius, shadow, spacing, type, useBrand, useColors } from '@/theme';
import { roadsAhead } from './roads';

const DRIVE_ETA = Math.round(type.display.size * 1.5);

/** "Arrive 14:22": words in Manrope, the simulation clock in the technical face, in the hero's own ink. */
function ArriveLine({ clock, color }: { clock: string; color: string }) {
  const [before, after = ''] = t('arriveAt', { clock: '\u0000' }).split('\u0000');
  return (
    <AppText variant="meta" style={{ color }}>
      {before}
      <AppText variant="mono" style={{ color }}>
        {clock}
      </AppText>
      {after}
    </AppText>
  );
}

/**
 * Drive mode (DESIGN_VISION appendix A): a reduced composition for a glance at a mount. The ETA,
 * the road you are on and the next one, and what to do now; a route change shows as one line in
 * the warning treatment. Two columns when the phone is landscape. Exit returns to the map.
 */
export function DriveScreen() {
  const tc = useColors();
  const brand = useBrand();
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
      <RoundButton icon={X} label={t('driveExitLabel')} onPress={exit} testID="drive-exit" />
      <ModeBadge onShell={false} />
    </View>
  );

  // The ETA is the hero: a deep solid card with large light numerals when there is a route, a plain card otherwise.
  const hero = !!rec;
  const etaBlock = (
    <View
      style={[styles.etaBlock, hero ? [styles.etaHero, { backgroundColor: brand.hero, borderColor: brand.heroEdge }] : styles.etaPlain, shadow(hero ? 'lg' : 'sm')]}
      accessible
      accessibilityLabel={rec ? `${enRoute ? t('etaLeft', { eta }) : eta}. ${routeLabel(rec)}` : next}
    >
      {rec ? (
        <View style={styles.heroTag}>
          <View style={styles.heroDot} />
          <AppText variant="label" style={{ color: brand.onHeroMuted }}>
            {t('recommended')}
          </AppText>
        </View>
      ) : noViable ? (
        <StateTag kind="critical" label={t('notViable')} />
      ) : null}
      <AppText variant="display" tone="ink" style={[styles.eta, hero && { color: brand.onHero }]} numberOfLines={1} adjustsFontSizeToFit testID="drive-eta">
        {eta}
      </AppText>
      {rec ? (
        <>
          <ArriveLine clock={formatSimClock(scenario.clockStartsAt, minuteS + etaS)} color={brand.onHeroMuted} />
          <AppText variant="title" style={{ color: brand.onHero }} numberOfLines={2}>
            {routeLabel(rec)}
          </AppText>
        </>
      ) : null}
    </View>
  );

  const roadBlock = (
    <View style={[styles.card, shadow('sm')]}>
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
    <View style={[styles.card, styles.now, shadow('sm')]}>
      <AppText variant="label" tone="accent">
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
      <ScrollView style={styles.scrollBleed} contentContainerStyle={[styles.body, landscape && styles.bodyLandscape]} showsVerticalScrollIndicator={false}>
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
  root: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.semibold },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouch },
  // The cards' shadows are wider than the cards: the scroller reaches past the gutters so they are not cut off.
  scrollBleed: { marginHorizontal: -spacing.md },
  body: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  bodyLandscape: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1, gap: spacing.md },
  etaBlock: { gap: spacing.xs, padding: spacing.lg + spacing.xxs, borderRadius: radius.sheet },
  etaHero: { borderWidth: hairline },
  etaPlain: { backgroundColor: tc.panel, borderWidth: hairline, borderColor: tc.panelLine },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  heroDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.accent, ...glow(tc.accent, 0.5) },
  eta: { fontSize: DRIVE_ETA, lineHeight: Math.round(DRIVE_ETA * 1.08), letterSpacing: -2 },
  card: { borderRadius: radius.sheet, backgroundColor: tc.panel, borderWidth: hairline, borderColor: tc.panelLine, overflow: 'hidden' },
  roadRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  roadDivider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  roadKey: { width: spacing.xl + spacing.md },
  road: { fontFamily: fontFamily.semibold, fontSize: type.eta.size - 8, lineHeight: type.eta.lineHeight - 6 },
  now: { gap: spacing.xs, padding: spacing.md },
  nowText: { fontFamily: fontFamily.semibold, fontSize: type.title.size + 4, lineHeight: type.title.lineHeight + 6 },
  change: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.card, marginTop: spacing.sm },
  actions: { paddingTop: spacing.sm },
}));
