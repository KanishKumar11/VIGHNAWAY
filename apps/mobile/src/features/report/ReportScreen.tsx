import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, TextInput, useWindowDimensions, View, type TextInputInstance } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import MapView, { Marker, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPORT_DESCRIPTION_MAX, type LatLng, type ReportType } from '@vighnaway/contracts';
import { vehiclePosition } from '@vighnaway/engine';
import { AppText } from '@/components/AppText';
import { APPROXIMATE_FIX_M } from '@/features/search/myLocation';
import { accurateFix, requestLocationPermission } from '@/lib/location';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { ModeBadge } from '@/components/EvidenceChips';
import { Crosshair, Eye, LocateFixed, TriangleAlert, X } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { Lottie } from '@/components/Lottie';
import { MapField } from '@/components/MapField';
import { easing, enterUp, PressScale } from '@/components/motion';
import { Segmented } from '@/components/Segmented';
import { ToastHost } from '@/components/Toast';
import { googleMapsConfigured } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { getDeviceId } from '@/lib/deviceId';
import { getGraph, snapToRoad } from '@/lib/engine';
import { graphForRegion } from '@/regions';
import { announce, haptic } from '@/lib/feedback';
import { useReduceMotion } from '@/lib/motion';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, fontFamily, LARGER_TEXT, useTheme, withAlpha, hairline, layout, motion, radius, spacing, text, useColors } from '@/theme';
import { DepthSelector } from './DepthSelector';
import { submitReport } from './submit';
import { emptyDraft, validateReport, type ReportDraft, type ReportErrors } from './validation';

const TYPES: { type: ReportType; label: StringKey }[] = [
  { type: 'flood', label: 'typeFlood' },
  { type: 'closure', label: 'typeClosure' },
  { type: 'congestion', label: 'typeCongestion' },
  { type: 'debris', label: 'typeDebris' },
  { type: 'accident', label: 'typeAccident' },
  { type: 'road_clear', label: 'typeRoadClear' },
];

/** Numbered step header: "01  What did you see?" with the error underneath. */
function Section({ step, label, error, children, index }: { step: number; label: string; error?: string; children: React.ReactNode; index: number }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterUp(index, reduce)} style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="num" tone="muted" style={styles.step}>
          {String(step).padStart(2, '0')}
        </AppText>
        <AppText variant="title" accessibilityRole="header" style={styles.flex}>
          {label}
        </AppText>
      </View>
      {children}
      {error ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <TriangleAlert size={14} color={tc.dangerInk} />
          <AppText variant="meta" tone="danger" style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** One of the six report tiles: glyph in a disc, label below; selection pops on a spring. */
function TypeTile({ type, label, selected, onPress, wide }: { type: ReportType; label: string; selected: boolean; onPress: () => void; wide?: boolean }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected && !reduce) pop.value = withSequence(withTiming(0.94, { duration: motion.buttonPress }), withSpring(1, motion.springSnappy));
  }, [selected, reduce, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fg = selected ? tc.panel : tc.ink;
  return (
    <Animated.View style={[styles.tileWrap, wide && styles.tileWrapWide, popStyle]}>
      <PressScale
        haptic="selection"
        onPress={onPress}
        testID={`type-${type}`}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[styles.tile, selected && styles.tileSelected]}
      >
        <View style={[styles.tileDisc, selected && styles.tileDiscSelected]}>
          <IncidentGlyph type={type} size={24} color={fg} />
        </View>
        <AppText variant="meta" tone={selected ? 'inverse' : 'ink'} numberOfLines={2} style={[styles.tileLabel, selected && styles.strong]}>
          {label}
        </AppText>
      </PressScale>
    </Animated.View>
  );
}

const TILE_PREVIEW = spacing.xl * 2;

function LocationPreview({ point }: { point: LatLng }) {
  const tc = useColors();
  const styles = useStyles();
  const { mapStyle } = useTheme();
  const mapReady = useUi((s) => s.mapStatus === 'ready');
  if (googleMapsConfigured && mapReady) {
    return (
      <View style={styles.preview}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          liteMode
          customMapStyle={mapStyle as unknown as MapStyleElement[]}
          region={{ latitude: point.lat, longitude: point.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          toolbarEnabled={false}
        >
          <Marker coordinate={{ latitude: point.lat, longitude: point.lng }} tracksViewChanges={false} />
        </MapView>
      </View>
    );
  }
  // No map: the navy field with a crosshair, never a fake map.
  return (
    <View style={styles.preview} accessibilityLabel={t('mapUnavailable')}>
      <MapField width={TILE_PREVIEW} height={TILE_PREVIEW} />
      <View style={styles.previewCross}>
        <Crosshair size={24} color={tc.routeRecommended} strokeWidth={2} />
      </View>
    </View>
  );
}

/** Report a hazard: a navigator modal (never opens a sheet modal). */
export function ReportScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const largerText = useSettings((s) => s.largerText);
  const wideTiles = fontScale * (largerText ? LARGER_TEXT : 1) > 1.2;
  const reduce = useReduceMotion();
  const params = useLocalSearchParams<{ fixture?: string }>();
  const fixture = useSettings((s) => s.fixtureMode === 'report') || params.fixture === '1';
  const liveMode = useSettings((s) => s.dataMode === 'live');
  const noteRef = useRef<TextInputInstance>(null);
  const [draft, setDraft] = useState<ReportDraft>(() =>
    fixture ? { ...emptyDraft, type: 'flood', depth: 'knee', note: 'Water up to the knee near the subway entrance' } : emptyDraft,
  );
  const [errors, setErrors] = useState<ReportErrors>({});
  const [status, setStatus] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [locationSource, setLocationSource] = useState<'map' | 'device'>('map');
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [headerH, setHeaderH] = useState(insets.top + layout.minTouch + spacing.xl);

  // Default point: the map centre when it is on a mapped road, else the vehicle, else the trip
  // start, so the form opens on a spot that can be sent (the map may be showing somewhere else).
  const fallbackPoint = useMemo<LatLng | null>(() => {
    const { graphFile, scenario } = useScenario.getState();
    const trip = useTrip.getState();
    const candidates: LatLng[] = [];
    const centre = useUi.getState().mapCenter;
    if (centre) candidates.push(centre);
    if (trip.vehicle) {
      const pos = vehiclePosition(getGraph(graphFile, useSettings.getState().profile), trip.vehicle);
      if (pos) candidates.push(pos.point);
    }
    const start = placeById(scenario, trip.originId)?.point;
    if (start) candidates.push(start);
    const car = getGraph(graphForRegion('andheri'), 'car');
    return candidates.find((p) => snapToRoad(car, p)) ?? candidates[0] ?? null;
  }, []);
  useEffect(() => {
    if (!draft.point && fallbackPoint) setDraft((d) => ({ ...d, point: fallbackPoint }));
  }, [draft.point, fallbackPoint]);
  // The road the report lands on (null = no mapped road nearby, so it cannot be sent).
  // Reports exist for the Andheri map only (the API checks them against it), whichever map is showing.
  const andheri = graphForRegion('andheri');
  const snap = useMemo(() => (draft.point ? snapToRoad(getGraph(andheri, 'car'), draft.point) : null), [draft.point, andheri]);

  // Auto-focus only after the modal's open transition, so the keyboard does not jump mid-animation.
  useEffect(() => {
    if (!fixture) return;
    const id = setTimeout(() => noteRef.current?.focus(), 450);
    return () => clearTimeout(id);
  }, [fixture]);

  const [discarded, setDiscarded] = useState(false);
  const dirty = !discarded && status === 'editing' && (draft.type !== null || draft.note.trim().length > 0);
  // Back, swipe and Close all ask before dropping a started report (Alert, not a custom dialog).
  usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert(t('discardTitle'), undefined, [
      { text: t('discardKeep'), style: 'cancel' },
      {
        text: t('discardConfirm'),
        style: 'destructive',
        onPress: () => {
          setDiscarded(true);
          repeat();
        },
      },
    ]);
  });

  const set = useCallback((patch: Partial<ReportDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  }, []);

  const takeMyLocation = async () => {
    setLocationNote(null);
    setLocationSource('device');
    try {
      const perm = await requestLocationPermission();
      if (perm === 'denied' || perm === 'unknown') {
        setLocationNote(t('locationDenied'));
        setLocationSource('map');
        return;
      }
      const fix = await accurateFix();
      set({ point: { lat: fix.lat, lng: fix.lng } });
      // Say when the position is rough, so the reporter can drag the map to the exact spot.
      if (perm === 'approximate') setLocationNote(t('locationApproximatePermission'));
      else if (fix.accuracyM !== null && fix.accuracyM > APPROXIMATE_FIX_M) setLocationNote(t('locationApproximate', { m: Math.round(fix.accuracyM) }));
    } catch {
      setLocationNote(t('locationFailed'));
      setLocationSource('map');
    }
  };

  const send = async () => {
    const result = validateReport(draft, getDeviceId());
    if (!result.ok) {
      setErrors(result.errors);
      haptic.warning();
      const first = Object.values(result.errors)[0];
      if (first) announce(first);
      return;
    }
    // The API only takes points on a mapped road: say so now rather than after a queued retry.
    if (!snap) {
      setErrors({ form: t('reportOffRoad') });
      haptic.warning();
      announce(t('reportOffRoad'));
      return;
    }
    setStatus('sending');
    const outcome = await submitReport({ ...result.input, point: snap.point });
    if (outcome.kind === 'error') {
      setStatus('editing');
      setErrors({ form: outcome.message });
      announce(outcome.message);
      return;
    }
    // The button morphs into the success animation first; the toast follows it.
    setStatus('sent');
    if (outcome.kind === 'sent') haptic.success();
    const toast = () => useToast.getState().show(outcome.kind === 'sent' ? t('toastSent') : t('toastPending'), outcome.kind === 'sent' ? 'positive' : 'neutral');
    if (reduce) toast();
    else setTimeout(toast, motion.reportSent * 2);
    setTimeout(() => router.dismiss(), reduce ? 600 : 1800);
  };

  const noteLen = draft.note.trim().length;
  const type = draft.type;
  const hasDetail = type === 'flood' || type === 'congestion' || type === 'debris' || type === 'accident';
  let step = 1;
  const stepOf = () => step++;

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      {/* Android draws the modal edge to edge: the header clears the status bar and side insets. */}
      <View
        style={[styles.header, { paddingTop: insets.top + spacing.sm, paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerRow}>
          <AppText variant="title" accessibilityRole="header" style={styles.flexShrink}>
            {t('reportTitle')}
          </AppText>
          <ModeBadge onShell={false} compact />
          <View style={styles.flex} />
          <PressScale haptic={null} onPress={() => router.dismiss()} accessibilityRole="button" accessibilityLabel={t('reportClose')} style={styles.close} hitSlop={spacing.xs}>
            <X size={20} color={tc.ink} />
          </PressScale>
        </View>
        <AppText variant="meta" tone="muted">
          {t(liveMode ? 'reportLiveNote' : 'reportSimulatedNote')}
        </AppText>
      </View>
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.minTouch + spacing.xl + insets.bottom, paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md },
        ]}
      >
        <Section step={stepOf()} label={t('reportTypeLabel')} error={errors.type} index={0}>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('reportTypeLabel')}>
            {TYPES.map((it) => (
              <TypeTile
                key={it.type}
                type={it.type}
                label={t(it.label)}
                selected={type === it.type}
                wide={wideTiles}
                onPress={() => set({ type: it.type, depth: null, congestion: null, severity: null, impassable: false })}
              />
            ))}
          </View>
        </Section>
        {type === 'flood' ? (
          <Section key="depth" step={stepOf()} label={t('depthLabel')} index={1}>
            <DepthSelector value={draft.depth} onChange={(depth) => set({ depth })} />
          </Section>
        ) : null}
        {type === 'congestion' ? (
          <Section key="congestion" step={stepOf()} label={t('congestionLabel')} error={errors.congestion} index={1}>
            <Segmented
              accessibilityLabel={t('congestionLabel')}
              value={draft.congestion}
              onChange={(congestion) => set({ congestion })}
              options={(['moderate', 'heavy', 'standstill'] as const).map((c) => ({
                value: c,
                testID: `congestion-${c}`,
                label: t(c === 'moderate' ? 'congestionModerate' : c === 'heavy' ? 'congestionHeavy' : 'congestionStandstill'),
              }))}
            />
          </Section>
        ) : null}
        {type === 'debris' || type === 'accident' ? (
          <Section key="severity" step={stepOf()} label={t('severityLabel')} index={1}>
            <Segmented
              accessibilityLabel={t('severityLabel')}
              value={draft.severity}
              onChange={(severity) => set({ severity })}
              options={(['low', 'medium', 'high'] as const).map((s) => ({
                value: s,
                label: t(s === 'low' ? 'severityLow' : s === 'medium' ? 'severityMedium' : 'severityHigh'),
              }))}
            />
            <View style={styles.switchCard}>
              <AppText style={styles.flex}>{t('impassableLabel')}</AppText>
              <Switch
                value={draft.impassable}
                onValueChange={(v) => set({ impassable: v })}
                accessibilityLabel={t('impassableLabel')}
                trackColor={{ true: tc.accent, false: tc.controlBorder }}
                thumbColor={tc.white}
              />
            </View>
          </Section>
        ) : null}
        <Section step={stepOf()} label={t('locationLabel')} error={errors.point} index={hasDetail ? 2 : 1}>
          <View style={styles.card}>
            {draft.point ? (
              <View
                style={styles.locRow}
                accessible
                accessibilityLabel={t(locationSource === 'device' ? 'locationFromDevice' : 'locationFromMap', {
                  lat: draft.point.lat.toFixed(5),
                  lng: draft.point.lng.toFixed(5),
                })}
              >
                <LocationPreview point={draft.point} />
                <View style={[styles.flex, styles.locText]}>
                  <AppText variant="label" tone="muted">
                    {t(locationSource === 'device' ? 'locationDeviceLabel' : 'locationMapLabel')}
                  </AppText>
                  <AppText variant="mono" testID="location-coords">
                    {draft.point.lat.toFixed(5)}
                  </AppText>
                  <AppText variant="mono">{draft.point.lng.toFixed(5)}</AppText>
                  <AppText variant="meta" tone={snap ? 'muted' : 'warn'} testID="location-road">
                    {snap ? (snap.roadName ? t('reportOnRoad', { road: snap.roadName }) : t('reportOnRoadUnnamed')) : t('reportOffRoadShort')}
                  </AppText>
                </View>
              </View>
            ) : null}
            <Segmented
              accessibilityLabel={t('locationLabel')}
              value={locationSource}
              onChange={(v) => {
                if (v === 'device') void takeMyLocation();
                else {
                  setLocationSource('map');
                  if (fallbackPoint) set({ point: fallbackPoint });
                }
              }}
              options={[
                { value: 'device', label: t('useMyLocation'), icon: LocateFixed },
                { value: 'map', label: t('useMapCentre'), icon: Crosshair },
              ]}
            />
          </View>
          {locationNote ? (
            <AppText variant="meta" tone="warn">
              {locationNote}
            </AppText>
          ) : null}
        </Section>
        <Section step={stepOf()} label={t('noteLabel')} error={errors.note} index={hasDetail ? 3 : 2}>
          <View style={[styles.inputWrap, noteFocused && styles.inputFocused, errors.note ? styles.inputError : null]}>
            <TextInput
              ref={noteRef}
              testID="report-note"
              value={draft.note}
              onChangeText={(note) => set({ note })}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              placeholder={t('notePlaceholder')}
              placeholderTextColor={tc.inkMuted}
              multiline
              style={styles.input}
              accessibilityLabel={t('noteLabel')}
              textAlignVertical="top"
            />
            <AppText variant="num" tone={noteLen > REPORT_DESCRIPTION_MAX ? 'danger' : 'muted'} style={styles.counter} testID="note-counter">
              {t('noteCounter', { n: noteLen })}
            </AppText>
          </View>
        </Section>
        <View style={[styles.switchCard, styles.switchRule]}>
          <View style={styles.switchIcon}>
            <Eye size={18} color={tc.ink} />
          </View>
          <AppText style={styles.flex}>{t('observedLabel')}</AppText>
          <Switch
            value={draft.observedPersonally}
            onValueChange={(v) => set({ observedPersonally: v })}
            accessibilityLabel={t('observedLabel')}
            trackColor={{ true: tc.accent, false: tc.controlBorder }}
            thumbColor={tc.white}
          />
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm, paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md }]}>
          {/* Pinned above the button so a failed send is never hidden below the fold. */}
          {errors.form ? (
            <View style={styles.formError} accessibilityRole="alert">
              <TriangleAlert size={16} color={tc.dangerInk} />
              <AppText tone="danger" testID="form-error" style={styles.flex}>
                {errors.form}
              </AppText>
            </View>
          ) : null}
          {status === 'sent' ? (
            <Animated.View
              entering={reduce ? undefined : ZoomIn.duration(motion.reportSent).easing(easing)}
              style={styles.sentButton}
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('sent')}
              testID="report-sent"
            >
              <Lottie name="success" size={spacing.xl + spacing.md} />
              <AppText variant="title">{t('sent')}</AppText>
            </Animated.View>
          ) : (
            <Animated.View exiting={reduce ? undefined : FadeOut.duration(motion.buttonPress * 2)} entering={reduce ? undefined : FadeIn}>
              <Button testID="send-report" label={status === 'sending' ? t('sending') : t('sendReport')} loading={status === 'sending'} onPress={() => void send()} />
            </Animated.View>
          )}
        </View>
      </KeyboardStickyView>
      {/* Toasts open under the header, never over the title or the status bar. */}
      <ToastHost top={headerH + spacing.xs} />
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.semibold },
  header: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: tc.panelHairline,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flexShrink: { flexShrink: 1 },
  close: {
    width: spacing.xl + spacing.xs,
    height: spacing.xl + spacing.xs,
    borderRadius: radius.chip,
    backgroundColor: tc.panelSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  step: { minWidth: spacing.lg },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tileWrap: { flexBasis: '31%', flexGrow: 1 },
  // Two columns at large text sizes, so labels never break mid-word.
  tileWrapWide: { flexBasis: '47%' },
  tile: {
    minHeight: spacing.xl * 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    // Narrow side padding so one-word labels ("Congestion") fit three across without breaking.
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.card,
    backgroundColor: tc.panel,
    // Control boundary at 3:1 (DESIGN_VISION 5.1); flat, no shadow.
    borderWidth: 1,
    borderColor: tc.controlBorder,
  },
  tileSelected: { backgroundColor: tc.ink, borderColor: tc.ink },
  tileDisc: {
    width: spacing.xl + spacing.sm,
    height: spacing.xl + spacing.sm,
    borderRadius: radius.chip,
    backgroundColor: tc.panelSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A translucent disc of the page colour on the ink tile (works on both themes).
  tileDiscSelected: { backgroundColor: withAlpha(tc.panel, 0.16) },
  tileLabel: { textAlign: 'center' },
  // Location: the preview and the source control, grouped by spacing rather than a card.
  card: { gap: spacing.sm },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locText: { gap: 2 },
  preview: { width: TILE_PREVIEW, height: TILE_PREVIEW, borderRadius: radius.button, overflow: 'hidden', backgroundColor: tc.shell },
  previewCross: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch + spacing.xs,
  },
  switchRule: { borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: tc.panelHairline },
  switchIcon: { width: spacing.xl, height: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    borderWidth: 1,
    borderColor: tc.controlBorder,
    borderRadius: radius.card,
    backgroundColor: tc.panel,
    padding: spacing.sm,
    paddingBottom: spacing.xs,
  },
  // Focus and error are drawn on the wrapper (2 px), so the browser's own outline is removed on web.
  inputFocused: { borderColor: tc.focus, borderWidth: 2 },
  input: { ...text.body, color: tc.ink, minHeight: spacing.xl * 2 + spacing.sm, padding: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  inputError: { borderColor: tc.danger, borderWidth: 2 },
  counter: { alignSelf: 'flex-end' },
  formError: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.card, backgroundColor: tc.dangerSurface },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: tc.shell, borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  sentButton: {
    minHeight: layout.minTouch + spacing.xxs,
    borderRadius: radius.button,
    backgroundColor: tc.tealSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
}));
