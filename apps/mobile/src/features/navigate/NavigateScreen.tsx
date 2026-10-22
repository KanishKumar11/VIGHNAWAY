import BottomSheet, { BottomSheetScrollView, useBottomSheetSpringConfigs, type BottomSheetModal } from '@gorhom/bottom-sheet';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSimClock, type Incident } from '@vighnaway/contracts';
import { buildIncidentIndex, remainingEtaS, travelledM } from '@vighnaway/engine';
import { graphAttribution } from '@vighnaway/scenario-data';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Flag, LocateFixed, MapIcon, Navigation } from '@/components/icons';
import { startFromPhoneIfLive } from '@/features/search/myLocation';
import { accurateFix, requestLocationPermission } from '@/lib/location';
import { PressScale } from '@/components/motion';
import { ToastHost } from '@/components/Toast';
import { WhyCard } from '@/components/WhyCard';
import { beginTrip } from '@/features/trip/deviceTrip';
import { changeDestination, endTrip } from '@/features/trip/planner';
import { useBackToClose } from '@/hooks/useBackToClose';
import { t } from '@/i18n/en';
import { whatToDoNow } from '@/i18n/engineText';
import { fmtDuration } from '@/i18n/format';
import { evalContext, getGraph } from '@/lib/engine';
import { graphForRegion } from '@/regions';
import { etaDeltaBars } from '@/lib/geometry';
import { useReduceMotion } from '@/lib/motion';
import { requestNotificationPermission } from '@/lib/notifications';
import { buildShareText, shareText } from '@/lib/share';
import { phoneReceipt } from '@/lib/receipt';
import { AskCard } from '@/features/ask/AskCard';
import { CONSOLE_URL } from '@/config/env';
import { useActivity } from '@/stores/activity';
import { connectionMode, useConnection } from '@/stores/connection';
import { useIncidentList, useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useToast } from '@/stores/toast';
import { activeRoute, recommendedRoute, useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, fontFamily, hairline, layout, motion, radius, shadow, spacing, useColors } from '@/theme';
import { DestinationSheet } from './DestinationSheet';
import { EvidenceSheet } from './EvidenceSheet';
import { MapMenu } from './MapMenu';
import { NavigateMap } from './NavigateMap';
import {
  ActivityRows,
  ArrivedCard,
  ChangeBanner,
  ChoiceNote,
  EmptyEvidence,
  EvaluatingCard,
  IncidentRow,
  maxDisplayedRoutes,
  MiniChange,
  NoViableCard,
  PeekCard,
  PeekMore,
  RoadsOnlyNote,
  RouteDetail,
  RouteRow,
  SectionLabel,
} from './SheetParts';
import { TopBar } from './TopBar';

const HANDLE_HEIGHT = spacing.lg;

/**
 * Sheet body. Small (default): ETA, route name, Start and a one-line change notice, so most of the
 * map is visible. Half: status, next step, reason, banner and the comparison. Full: why, evidence, activity.
 */
function SheetBody({
  onPeekLayout,
  onCompareLayout,
  onDetails,
  onHalf,
  onIncidentPress,
  onDrive,
}: {
  onPeekLayout: (h: number) => void;
  onCompareLayout: (h: number) => void;
  onDetails: () => void;
  onHalf: () => void;
  onIncidentPress: (i: Incident) => void;
  onDrive: () => void;
}) {
  const styles = useStyles();
  const scenario = useScenario((s) => s.scenario);
  const graphFile = useScenario((s) => s.graphFile);
  const profile = useSettings((s) => s.profile);
  const plan = useTrip((s) => s.plan);
  const mode = useTrip((s) => s.mode);
  const vehicle = useTrip((s) => s.vehicle);
  const banner = useTrip((s) => s.banner);
  const evaluating = useTrip((s) => s.evaluating);
  const destinationId = useTrip((s) => s.destinationId);
  const originId = useTrip((s) => s.originId);
  const minuteS = useSim((s) => Math.floor(s.simTimeS / 60) * 60);
  const simPlaying = useSim((s) => s.state === 'playing' || s.clockSource === 'local');
  const live = useConnection((s) => connectionMode(s.net, s.socket) === 'live');
  const fixture = useSettings((s) => s.fixtureMode !== null);
  const liveMode = useSettings((s) => s.dataMode === 'live');
  const liveLocation = useTrip((s) => s.liveLocation);
  const access = useTrip((s) => s.access);
  // The Amritsar to Ambala map has roads only: no incidents, evidence or alerts exist for it.
  const roadsOnly = useScenario((s) => s.region !== 'andheri');
  const incidents = useIncidentList();
  const byId = useIncidents((s) => s.byId);
  const activity = useActivity((s) => s.entries);

  const graph = useMemo(() => getGraph(graphFile, profile), [graphFile, profile]);
  // The route the trip uses: the one the traveller tapped, else the recommended one.
  const selectedRouteId = useTrip((s) => s.selectedRouteId);
  const rec = activeRoute(plan, selectedRouteId);
  const engineRec = recommendedRoute(plan);
  const chosen = !!rec && !!engineRec && rec.routeId !== engineRec.routeId;
  const dest = placeById(scenario, destinationId);
  const enRoute = mode === 'en_route' && !!vehicle;

  const etaS = useMemo(() => {
    if (enRoute && vehicle) return remainingEtaS(graph, vehicle, buildIncidentIndex(incidents), evalContext(scenario, minuteS));
    return rec ? rec.etaS + (plan?.leadInS ?? 0) : 0;
  }, [enRoute, vehicle, graph, incidents, scenario, minuteS, rec, plan]);

  const travelledFraction = useMemo(() => {
    if (!enRoute || !vehicle || !rec) return undefined;
    const same = vehicle.edgeIds.length === rec.edgeIds.length && vehicle.edgeIds.every((id, i) => id === rec.edgeIds[i]);
    return same ? travelledM(graph, vehicle) / Math.max(1, rec.distanceM) : undefined;
  }, [enRoute, vehicle, rec, graph]);

  const routeIncidents = useMemo(() => {
    if (!plan) return [] as Incident[];
    const ids = new Set<string>();
    for (const r of plan.routes) {
      for (const h of r.hazards) if (h.effect !== 'none') ids.add(h.incidentId);
      for (const b of r.blockedBy) ids.add(b.incidentId);
    }
    return [...ids]
      .sort()
      .map((id) => byId[id])
      .filter((i): i is Incident => !!i);
  }, [plan, byId]);

  const peekEvidence = useMemo(() => {
    if (!rec) return [] as Incident[];
    const ids = [...new Set(rec.hazards.filter((h) => h.effect !== 'none').map((h) => h.incidentId))];
    return ids.map((id) => byId[id]).filter((i): i is Incident => !!i);
  }, [rec, byId]);

  const bars = useMemo(() => (plan ? etaDeltaBars(plan.routes, plan.recommendedRouteId) : []), [plan]);

  const onShare = useCallback(() => {
    if (!plan || !rec) return;
    const message = buildShareText({
      plan,
      route: rec,
      placeName: dest?.name ?? '',
      graph,
      incidents: byId,
      clockStartsAt: scenario.clockStartsAt,
      etaS,
      live: liveMode,
      // A receipt re-plans from the trip origin, so it is only attached while planning, not while following a route.
      receipt:
        mode === 'en_route'
          ? null
          : phoneReceipt({
              scenario,
              graph,
              incidents: Object.values(byId),
              seq: useIncidents.getState().lastSeq,
              nowS: plan.evaluatedAtS,
              originId,
              destinationId,
              consoleUrl: CONSOLE_URL,
            }),
    });
    void shareText(message).then((ok) => {
      if (!ok) useToast.getState().show(t('shareFailed'), 'warn');
    });
  }, [plan, rec, dest, graph, byId, scenario, etaS, liveMode, mode, originId, destinationId]);

  // Live mode has no simulation clock: the trip follows the phone, or stays a planned route.
  const hint = liveMode
    ? liveLocation === 'denied'
      ? t('livePlannedOnly')
      : enRoute && liveLocation === 'following'
        ? t('liveFollowing')
        : null
    : enRoute && !simPlaying && live && !fixture
      ? t('waitingForClock')
      : null;
  // The scan shows for at least motion.evaluatingMin whenever the planner evaluates (planner.ts).
  const showEvaluating = !plan || (evaluating && !plan.noViableRoute && mode !== 'en_route');
  const arriveClock = rec ? formatSimClock(scenario.clockStartsAt, minuteS + etaS) : undefined;
  // In the no-viable state the card is the message: its banner's cause moves into the card.
  const noViableBanner = !!plan?.noViableRoute && banner?.title === t('noViableTitle');

  return (
    <>
      <View onLayout={(e) => onPeekLayout(e.nativeEvent.layout.height)} style={styles.peekWrap}>
        {banner && !noViableBanner ? <MiniChange banner={banner} onPress={onHalf} onDismiss={() => useTrip.getState().dismissBanner()} /> : null}
        {showEvaluating ? (
          <EvaluatingCard routes={plan?.routes.length || maxDisplayedRoutes} incidents={incidents.length} />
        ) : mode === 'arrived' ? (
          <ArrivedCard placeName={dest?.name ?? ''} onDone={endTrip} />
        ) : plan?.noViableRoute ? (
          <NoViableCard plan={plan} onGoTo={changeDestination} cause={noViableBanner ? banner?.message : undefined} onDetails={onDetails} />
        ) : rec ? (
          <PeekCard route={rec} etaS={etaS} enRoute={enRoute} chosen={chosen} onStart={() => void beginTrip()} onEnd={endTrip} />
        ) : enRoute ? (
          <AppText variant="eta">{t('etaLeft', { eta: fmtDuration(etaS) })}</AppText>
        ) : null}
      </View>
      {rec && !showEvaluating && mode !== 'arrived' && !plan?.noViableRoute ? (
        <View style={styles.more}>
          {banner && !noViableBanner ? (
            <ChangeBanner
              banner={banner}
              incident={banner.incidentId ? byId[banner.incidentId] : null}
              nowS={minuteS}
              onDetails={onDetails}
              onDismiss={() => useTrip.getState().dismissBanner()}
            />
          ) : null}
          {chosen && engineRec && !enRoute ? <ChoiceNote route={rec} recommended={engineRec} onReset={() => useTrip.getState().selectRoute(null)} /> : null}
          <PeekMore
            route={rec}
            arriveClock={arriveClock}
            nextStep={plan ? whatToDoNow(plan, dest?.name) : undefined}
            // The banner already explains the change: the reason line steps aside until it is dismissed.
            compact={!!banner}
            onShare={onShare}
            onDrive={onDrive}
            hint={hint}
          />
          {roadsOnly ? <RoadsOnlyNote access={access} /> : null}
        </View>
      ) : null}
      {plan && plan.routes.length > 0 && !showEvaluating ? (
        <View style={styles.half} onLayout={(e) => onCompareLayout(e.nativeEvent.layout.height)}>
          {rec && mode !== 'arrived' && !plan.noViableRoute ? (
            <RouteDetail route={rec} evidence={peekEvidence} nowS={minuteS} travelledFraction={travelledFraction} onIncidentPress={onIncidentPress} />
          ) : null}
          <View style={styles.section}>
            <SectionLabel count={plan.routes.length}>{t('compareTitle')}</SectionLabel>
            <View style={styles.rows}>
              {plan.routes.map((r, i) => (
                <RouteRow
                  key={r.routeId}
                  route={r}
                  bar={bars.find((b) => b.routeId === r.routeId)}
                  index={i}
                  selected={r.routeId === rec?.routeId}
                  onSelect={r.role !== 'blocked' && mode === 'planning' ? () => useTrip.getState().selectRoute(r.routeId === plan.recommendedRouteId ? null : r.routeId) : undefined}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}
      {rec && !showEvaluating && !roadsOnly ? <WhyCard route={rec} /> : null}
      {plan && rec && !showEvaluating && mode !== 'arrived' && !roadsOnly ? <AskCard plan={plan} graph={graph} /> : null}
      {roadsOnly ? null : (
        <View style={styles.section}>
          <SectionLabel count={routeIncidents.length}>{t('evidenceTitle')}</SectionLabel>
          {routeIncidents.length ? (
            <View>
              {routeIncidents.map((i, idx) => (
                <IncidentRow key={i.id} incident={i} nowS={minuteS} onPress={onIncidentPress} index={idx} />
              ))}
            </View>
          ) : (
            <EmptyEvidence />
          )}
        </View>
      )}
      <View style={styles.section}>
        <SectionLabel>{t('activityTitle')}</SectionLabel>
        <ActivityRows entries={activity.slice(0, 5)} clockStartsAt={scenario.clockStartsAt} />
      </View>
      <View style={styles.attributionBlock}>
        <AppText variant="meta" tone="muted">
          {graphAttribution(graphFile)}
        </AppText>
        <AppText variant="meta" tone="muted">
          {t('mapDataGoogle')}
        </AppText>
      </View>
    </>
  );
}

export function NavigateScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const navigation = useNavigation();
  const sheetRef = useRef<BottomSheet>(null);
  const evidenceRef = useRef<BottomSheetModal>(null);
  const destRef = useRef<BottomSheetModal>(null);
  const animatedPosition = useSharedValue(winH);
  const [peekContent, setPeekContent] = useState(0);
  const [compareH, setCompareH] = useState(0);
  const [headerBottom, setHeaderBottom] = useState(insets.top + layout.minTouch * 2 + spacing.lg);
  const [sheetTop, setSheetTop] = useState(winH - layout.sheetSnapMini - insets.bottom);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [destOpen, setDestOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayH, setOverlayH] = useState(layout.minTouch * 2);
  const scenario = useScenario((s) => s.scenario);
  const graphFile = useScenario((s) => s.graphFile);
  const noViable = useTrip((s) => !!s.plan?.noViableRoute);
  const plan = useTrip((s) => s.plan);
  const simTimeS = useSim((s) => Math.floor(s.simTimeS / 60) * 60);
  const evidence = useIncidents((s) => (evidenceId ? s.byId[evidenceId] ?? null : null));
  const schematic = useUi((s) => s.mapStatus === 'unavailable');
  const mapReady = useUi((s) => s.mapStatus === 'ready');
  const liveMode = useSettings((s) => s.dataMode === 'live');
  // While a trip runs the camera follows the vehicle; dragging the map lets go, and this button takes it back.
  const tripRunning = useTrip((s) => s.mode === 'en_route');
  const followingCamera = useUi((s) => s.following);

  // Live mode: start from the phone when location is already allowed (never prompts at launch).
  useEffect(() => {
    if (liveMode) void startFromPhoneIfLive();
  }, [liveMode]);

  // "Show my location": asks only now (the traveller tapped it), then centres on an accurate fix.
  const locateMe = useCallback(async () => {
    const perm = await requestLocationPermission();
    if (perm === 'denied' || perm === 'unknown') {
      useToast.getState().show(t('myLocationDenied'), 'warn');
      return;
    }
    if (perm === 'approximate') useToast.getState().show(t('myLocationApproximatePermission'), 'warn');
    if (!useUi.getState().devicePosition) {
      try {
        await accurateFix({ timeoutMs: 8000 });
      } catch {
        useToast.getState().show(t('myLocationFailed'), 'warn');
        return;
      }
    }
    useUi.getState().requestRecenter();
  }, []);

  // The lowest stop is only as tall as the small decision, so the map stays open by default.
  const peek = Math.max(layout.sheetSnapMini, peekContent + HANDLE_HEIGHT + spacing.sm) + insets.bottom;
  // Half shows the comparison rows in full; it never drops below 50% or crowds the header.
  const container = winH - insets.top;
  // ...but always leaves a band of map under the header.
  const halfMax = Math.min(container * 0.68, winH - headerBottom - spacing.sm);
  const half = Math.round(Math.min(halfMax, Math.max(container * 0.5, peek + compareH + spacing.md)));
  const snapPoints = useMemo(() => [peek, Math.max(half, peek + spacing.xl), layout.sheetSnapFull], [peek, half]);
  const springConfig = useBottomSheetSpringConfigs(motion.spring);

  // Ask for notification permission once, after the first route is on screen (never at launch).
  const hasRoute = useTrip((s) => !!s.plan?.recommendedRouteId);
  const notificationsAsked = useSettings((s) => s.notificationsAsked);
  const fixtureMode = useSettings((s) => s.fixtureMode);
  useEffect(() => {
    if (!hasRoute || notificationsAsked || fixtureMode) return;
    const id = setTimeout(() => {
      useSettings.getState().markNotificationsAsked();
      void requestNotificationPermission();
    }, 1500);
    return () => clearTimeout(id);
  }, [hasRoute, notificationsAsked, fixtureMode]);

  // The Amritsar to Ambala map is large: read it in the background once the first route is on
  // screen, so the first search that needs it does not stall the phone.
  useEffect(() => {
    if (!hasRoute) return;
    const id = setTimeout(() => {
      getGraph(graphForRegion('north'), useSettings.getState().profile);
    }, 6000);
    return () => clearTimeout(id);
  }, [hasRoute]);

  // No viable route: expand the sheet to show the calm message over the dimmed map.
  useEffect(() => {
    if (noViable) sheetRef.current?.snapToIndex(1);
  }, [noViable]);

  const mapPadding = useMemo(
    () => ({
      top: headerBottom + spacing.xs,
      left: insets.left + spacing.xs,
      right: insets.right + spacing.xs,
      // The Google logo sits just above the sheet, never under it.
      bottom: Math.min(Math.max(0, winH - sheetTop), Math.max(0, winH - headerBottom - layout.minTouch * 2)),
    }),
    [headerBottom, insets.left, insets.right, winH, sheetTop],
  );
  // The schematic fits between the header and the overlay row above the sheet at peek, and stays
  // still while the sheet moves. A tall peek (banner) never squeezes it below ~half the screen,
  // and small peek changes (evaluating, chips) do not re-fit it.
  const fitTarget = Math.min(peek, Math.round(winH * 0.42)) + overlayH + spacing.xs;
  const [fitBottom, setFitBottom] = useState(fitTarget);
  useEffect(() => {
    if (Math.abs(fitTarget - fitBottom) > spacing.xl) setFitBottom(fitTarget);
  }, [fitTarget, fitBottom]);
  const fitPadding = useMemo(
    () => ({ top: headerBottom, left: insets.left + spacing.xs, right: insets.right + spacing.xs, bottom: fitBottom }),
    [headerBottom, insets.left, insets.right, fitBottom],
  );

  // The overlay row (legend, Report, attribution) rides on the sheet and fades out before it
  // could reach the top bar, at any sheet position.
  const headerLimit = headerBottom + spacing.xs;
  const overlayFadeTop = winH * 0.5;
  const overlayStyle = useAnimatedStyle(() => {
    const top = animatedPosition.value - overlayH - spacing.xs;
    const room = top - headerLimit;
    // Also steps aside once the sheet passes mid-screen, so a tall sheet never leaves the row
    // floating over the little map that is left.
    const high = (animatedPosition.value - overlayFadeTop) / spacing.xl;
    return {
      transform: [{ translateY: Math.max(headerLimit, top) }],
      opacity: Math.min(1, Math.max(0, Math.min(room / spacing.xl, high + 1))),
    };
  });

  const openIncident = useCallback((i: Incident) => {
    Keyboard.dismiss();
    setEvidenceId(i.id);
    evidenceRef.current?.present();
  }, []);
  const closeEvidence = useCallback(() => {
    evidenceRef.current?.dismiss();
    setEvidenceId(null);
  }, []);
  const closeDest = useCallback(() => {
    destRef.current?.dismiss();
    setDestOpen(false);
  }, []);
  const collapseSheet = useCallback(() => sheetRef.current?.snapToIndex(0), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useBackToClose(menuOpen, closeMenu);
  useBackToClose(evidenceId !== null, closeEvidence);
  useBackToClose(destOpen && evidenceId === null, closeDest);
  useBackToClose(sheetIndex > 0 && evidenceId === null && !destOpen, collapseSheet);

  const openReport = useCallback(() => {
    // Never open a sheet modal from Report: close ours before the modal route opens.
    evidenceRef.current?.dismiss();
    destRef.current?.dismiss();
    router.push('/report');
  }, []);

  // Full-screen routes: close our sheet modals first, as for Report.
  const openRoute = useCallback((path: '/drive' | '/map-list') => {
    evidenceRef.current?.dismiss();
    destRef.current?.dismiss();
    setEvidenceId(null);
    setDestOpen(false);
    router.push(path);
  }, []);

  const openDrawer = useCallback(() => {
    Keyboard.dismiss();
    (navigation as unknown as { openDrawer: () => void }).openDrawer();
  }, [navigation]);

  const attribution = graphFile.source === 'osm' ? graphAttribution(graphFile) : t('openStreetMapFixture');

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <NavigateMap padding={mapPadding} fitPadding={fitPadding} dimmed={noViable} onIncidentPress={openIncident} onMapPress={Keyboard.dismiss} />
      {/* Rides above the sheet: schematic legend (left), Report (right), road-data attribution
          right-aligned under it, clear of Google's logo on the left. */}
      <Animated.View
        style={[styles.overlay, { left: insets.left + spacing.md, right: insets.right + spacing.md }, overlayStyle]}
        pointerEvents={sheetIndex >= 2 ? 'none' : 'box-none'}
        onLayout={(e) => setOverlayH(e.nativeEvent.layout.height)}
      >
        <View style={styles.overlayRow} pointerEvents="box-none">
          {schematic ? (
            <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.banner)} style={styles.legend} accessibilityRole="text">
              <MapIcon size={14} color={tc.inkOnShellMuted} />
              <AppText variant="meta" tone="onShellMuted" numberOfLines={2} style={styles.legendText}>
                {t('schematicLegend')}
              </AppText>
            </Animated.View>
          ) : (
            // Google's logo owns the bottom-left corner: nothing is drawn over it.
            <View />
          )}
          <View style={styles.fabs} pointerEvents="box-none">
            {tripRunning && !followingCamera && mapReady ? (
              <PressScale
                onPress={() => useUi.getState().setFollowing(true)}
                style={[styles.fab, styles.fabSmall, shadow('md')]}
                accessibilityRole="button"
                accessibilityLabel={t('recenterNav')}
                testID="recenter-nav"
              >
                <Navigation size={20} color={tc.accentInk} strokeWidth={2.25} />
              </PressScale>
            ) : null}
            {liveMode && mapReady ? (
              <PressScale
                onPress={() => void locateMe()}
                style={[styles.fab, styles.fabSmall, shadow('md')]}
                accessibilityRole="button"
                accessibilityLabel={t('locateMe')}
                accessibilityHint={t('locateMeHint')}
                testID="locate-me"
              >
                <LocateFixed size={20} color={tc.accentInk} strokeWidth={2.25} />
              </PressScale>
            ) : null}
            <PressScale onPress={openReport} style={[styles.fab, shadow('md')]} accessibilityRole="button" accessibilityLabel={t('reportButtonLabel')} testID="open-report">
              <Flag size={18} color={tc.ink} strokeWidth={2.25} />
              <AppText variant="body" style={styles.fabLabel}>
                {t('reportButton')}
              </AppText>
            </PressScale>
          </View>
        </View>
        <AppText variant="meta" tone="onShellMuted" style={styles.attributionText} numberOfLines={2} pointerEvents="none">
          {attribution}
        </AppText>
      </Animated.View>
      <TopBar
        onOpenDrawer={openDrawer}
        onOpenDestinations={() => {
          setDestOpen(true);
          destRef.current?.present();
        }}
        onLayout={setHeaderBottom}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
      />
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        topInset={insets.top}
        animatedPosition={animatedPosition}
        animationConfigs={springConfig}
        onAnimate={() => Keyboard.dismiss()}
        onChange={(index, position) => {
          setSheetIndex(index);
          setSheetTop(position);
        }}
        style={shadow('lg')}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView testID="sheet-content" contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + spacing.lg }]}>
          <SheetBody
            onPeekLayout={setPeekContent}
            onCompareLayout={setCompareH}
            onDetails={() => sheetRef.current?.snapToIndex(2)}
            onHalf={() => sheetRef.current?.snapToIndex(1)}
            onIncidentPress={openIncident}
            onDrive={() => openRoute('/drive')}
          />
        </BottomSheetScrollView>
      </BottomSheet>
      {menuOpen ? (
        <MapMenu
          top={headerBottom + layout.minTouch + spacing.sm}
          onClose={closeMenu}
          onReport={openReport}
          onList={() => openRoute('/map-list')}
          onLocate={liveMode ? () => void locateMe() : undefined}
          onSettings={() => router.push('/settings')}
        />
      ) : null}
      {/* Under the options button, which hangs below the header at the right. */}
      <ToastHost top={headerBottom + layout.minTouch + spacing.sm} />
      <EvidenceSheet ref={evidenceRef} incident={evidence} plan={plan} nowS={simTimeS} clockStartsAt={scenario.clockStartsAt} onDismiss={closeEvidence} />
      <DestinationSheet
        ref={destRef}
        onChosen={closeDest}
        onDismiss={() => setDestOpen(false)}
      />
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shellDeep },
  overlay: { position: 'absolute', top: 0, gap: spacing.xs },
  overlayRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.chip,
    backgroundColor: tc.shellOverlay,
    borderWidth: hairline,
    borderColor: tc.shellHairlineStrong,
    marginBottom: spacing.xxs,
  },
  legendText: { flexShrink: 1 },
  fabLabel: { fontFamily: fontFamily.semibold },
  fab: {
    height: layout.minTouch,
    borderRadius: radius.chip,
    backgroundColor: tc.panelRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.md + 2,
  },
  fabs: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  fabSmall: { width: layout.minTouch, paddingLeft: 0, paddingRight: 0, justifyContent: 'center' },
  attributionText: { textAlign: 'right', alignSelf: 'flex-end', maxWidth: '78%' },
  sheetBg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine, width: spacing.xl + spacing.xxs, height: spacing.xxs + 1 },
  sheetContent: { paddingHorizontal: spacing.md, paddingTop: spacing.xxs, gap: spacing.lg },
  peekWrap: { gap: spacing.xs },
  more: { gap: spacing.sm, paddingTop: spacing.sm },
  section: { gap: spacing.sm },
  half: { gap: spacing.lg },
  rows: { gap: spacing.sm },
  attributionBlock: { gap: spacing.xxs, paddingTop: spacing.sm, borderTopWidth: hairline, borderTopColor: tc.panelHairline },
}));
