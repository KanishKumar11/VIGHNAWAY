import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, TextInput, View, type TextInputInstance } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import MapView, { Marker, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPORT_DESCRIPTION_MAX, type LatLng, type ReportType } from '@vighnaway/contracts';
import { vehiclePosition } from '@vighnaway/engine';
import { AppText } from '@/components/AppText';
import { APPROXIMATE_FIX_M } from '@/features/search/myLocation';
import { accurateFix, requestLocationPermission } from '@/lib/location';
import type { CapturedPhoto } from '@/lib/photo';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { ModeBadge } from '@/components/EvidenceChips';
import { Check, Crosshair, Eye, LocateFixed, MapPin, TriangleAlert, X } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { Lottie } from '@/components/Lottie';
import { MapField } from '@/components/MapField';
import { easing, enterUp, PressScale } from '@/components/motion';
import { Segmented } from '@/components/Segmented';
import { ToastHost } from '@/components/Toast';
import { Card, Row, RoundButton, GUTTER } from '@/components/ui';
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
import { createStyles, fontFamily, glow, shadow, useTheme, withAlpha, hairline, layout, motion, radius, spacing, text, useColors, type ThemeColors } from '@/theme';
import { DepthSelector } from './DepthSelector';
import { MapPicker } from './MapPicker';
import { PhotoField } from './PhotoField';
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

/** One hue per report type, so each choice is recognisable before it is read. */
const typeColor = (tc: ThemeColors, type: ReportType): string =>
  ({ flood: tc.floodProneSolid, closure: tc.inkMuted, congestion: tc.warn, debris: tc.brandAlt, accident: tc.danger, road_clear: tc.positive })[type];

/** A labelled group of controls, with the field's error underneath. */
function Step({ title, error, index, bare, children }: { title: string; error?: string; index: number; bare?: boolean; children: React.ReactNode }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterUp(Math.min(index, 8), reduce)} style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepNum} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <AppText variant="label" tone="onAccent" style={styles.stepNumText}>
            {String(index + 1)}
          </AppText>
        </View>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {bare ? children : <Card>{children}</Card>}
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

/** One of the six report choices: a tinted glyph disc and the label; the picked one takes its hue and a tick. */
function TypeCard({ type, label, selected, onPress }: { type: ReportType; label: string; selected: boolean; onPress: () => void }) {
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
    if (selected && !reduce) pop.value = withSequence(withTiming(0.95, { duration: motion.buttonPress }), withSpring(1, motion.springSnappy));
  }, [selected, reduce, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const hue = typeColor(tc, type);
  return (
    <Animated.View style={[styles.typeWrap, popStyle]}>
      <PressScale
        haptic="selection"
        onPress={onPress}
        testID={`type-${type}`}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[styles.type, selected ? [{ backgroundColor: withAlpha(hue, 0.12), borderColor: hue }, glow(hue, 0.5)] : [{ backgroundColor: tc.panel, borderColor: tc.panelLine }, shadow('sm')]]}
      >
        <View style={[styles.typeDisc, { backgroundColor: withAlpha(hue, selected ? 0.22 : 0.14) }]}>
          <IncidentGlyph type={type} size={26} color={hue} />
        </View>
        <AppText variant="label" numberOfLines={2} style={[styles.typeLabel, selected && styles.strong]}>
          {label}
        </AppText>
        {selected ? (
          <Animated.View entering={reduce ? undefined : ZoomIn.duration(motion.statusUpgrade)} style={[styles.tick, { backgroundColor: hue }]}>
            <Check size={12} color={tc.white} strokeWidth={3} />
          </Animated.View>
        ) : null}
      </PressScale>
    </Animated.View>
  );
}

const TILE_PREVIEW = spacing.xl * 2 + spacing.sm;

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
  const [locationSource, setLocationSource] = useState<'auto' | 'map' | 'device'>('auto');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [headerH, setHeaderH] = useState(insets.top + layout.minTouch + spacing.xl);

  // Default point: the map centre when it is on a mapped road, else the vehicle, else the trip
  // start, so the form opens on a spot that can be sent (the map may be showing somewhere else).
  // Live mode takes a report from anywhere, so it keeps the map centre wherever it is.
  const fallbackPoint = useMemo<LatLng | null>(() => {
    const { graphFile, scenario } = useScenario.getState();
    const trip = useTrip.getState();
    const candidates: LatLng[] = [];
    const centre = useUi.getState().mapCenter;
    if (centre) candidates.push(centre);
    if (centre && useSettings.getState().dataMode === 'live') return centre;
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
  // Snapping uses the Andheri map (the only graph the API routes on). Live mode sends a report that misses it as off-map.
  const andheri = graphForRegion('andheri');
  const snap = useMemo(() => (draft.point ? snapToRoad(getGraph(andheri, 'car'), draft.point) : null), [draft.point, andheri]);

  // Auto-focus only after the modal's open transition, so the keyboard does not jump mid-animation.
  useEffect(() => {
    if (!fixture) return;
    const id = setTimeout(() => noteRef.current?.focus(), 450);
    return () => clearTimeout(id);
  }, [fixture]);

  const [discarded, setDiscarded] = useState(false);
  const dirty = !discarded && status === 'editing' && (draft.type !== null || draft.note.trim().length > 0 || photo !== null);
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
    try {
      const perm = await requestLocationPermission();
      if (perm === 'denied' || perm === 'unknown') {
        setLocationNote(t('locationDenied'));
        return;
      }
      const fix = await accurateFix();
      set({ point: { lat: fix.lat, lng: fix.lng } });
      setLocationSource('device');
      // Say when the position is rough, so the reporter can drag the map to the exact spot.
      if (perm === 'approximate') setLocationNote(t('locationApproximatePermission'));
      else if (fix.accuracyM !== null && fix.accuracyM > APPROXIMATE_FIX_M) setLocationNote(t('locationApproximate', { m: Math.round(fix.accuracyM) }));
    } catch {
      setLocationNote(t('locationFailed'));
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
    // The demo scenario only takes points on a mapped road: say so now rather than after a queued retry.
    // Live mode takes a report from anywhere; off a mapped road it is saved as off-map and changes no route.
    if (!snap && !liveMode) {
      setErrors({ form: t('reportOffRoad') });
      haptic.warning();
      announce(t('reportOffRoad'));
      return;
    }
    setStatus('sending');
    const outcome = await submitReport({ ...result.input, point: snap?.point ?? result.input.point }, photo ? { data: photo.data } : null);
    if (outcome.kind === 'error') {
      setStatus('editing');
      setErrors({ form: outcome.message });
      announce(outcome.message);
      return;
    }
    // The button morphs into the success animation first; the toast follows it.
    setStatus('sent');
    if (outcome.kind === 'sent') haptic.success();
    const photoFailed = outcome.kind === 'sent' && outcome.photo === 'failed';
    const toastText = outcome.kind !== 'sent' ? t('toastPending') : outcome.offMap ? t('toastSentOffMap') : photoFailed ? t('toastPhotoFailed') : outcome.photo === 'sent' ? t('toastSentPhoto') : t('toastSent');
    const toast = () => useToast.getState().show(toastText, outcome.kind === 'sent' ? (photoFailed ? 'warn' : 'positive') : 'neutral');
    if (reduce) toast();
    else setTimeout(toast, motion.reportSent * 2);
    if (outcome.kind === 'pending') setTimeout(() => router.replace('/relay'), reduce ? 600 : 1800);
    else setTimeout(() => router.dismiss(), reduce ? 600 : 1800);
  };

  const noteLen = draft.note.trim().length;
  const type = draft.type;
  const hasDetail = type === 'flood' || type === 'congestion' || type === 'debris' || type === 'accident';

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      {/* Android draws the modal edge to edge: the header clears the status bar and side insets. */}
      <View
        style={[styles.header, { paddingTop: insets.top + spacing.xs, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerBar}>
          <ModeBadge onShell={false} compact />
          <RoundButton icon={X} label={t('reportClose')} onPress={() => router.dismiss()} testID="report-close" />
        </View>
        <AppText variant="headline" accessibilityRole="header">
          {t('reportTitle')}
        </AppText>
        <AppText tone="muted">{t(liveMode ? 'reportLiveNote' : 'reportSimulatedNote')}</AppText>
      </View>
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.minTouch + spacing.xl + insets.bottom, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER },
        ]}
      >
        <Step title={t('reportTypeLabel')} error={errors.type} index={0} bare>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('reportTypeLabel')}>
            {TYPES.map((it) => (
              <TypeCard
                key={it.type}
                type={it.type}
                label={t(it.label)}
                selected={type === it.type}
                onPress={() => set({ type: it.type, depth: null, congestion: null, severity: null, impassable: false })}
              />
            ))}
          </View>
        </Step>
        {type === 'flood' ? (
          <Step key="depth" title={t('depthLabel')} index={1}>
            <View style={styles.pad}>
              <DepthSelector value={draft.depth} onChange={(depth) => set({ depth })} />
            </View>
          </Step>
        ) : null}
        {type === 'congestion' ? (
          <Step key="congestion" title={t('congestionLabel')} error={errors.congestion} index={1} bare>
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
          </Step>
        ) : null}
        {type === 'debris' || type === 'accident' ? (
          <Step key="severity" title={t('severityLabel')} index={1}>
            <View style={styles.pad}>
              <Segmented
                accessibilityLabel={t('severityLabel')}
                value={draft.severity}
                onChange={(severity) => set({ severity })}
                options={(['low', 'medium', 'high'] as const).map((s) => ({
                  value: s,
                  label: t(s === 'low' ? 'severityLow' : s === 'medium' ? 'severityMedium' : 'severityHigh'),
                }))}
              />
            </View>
            <Row
              icon={TriangleAlert}
              iconTone="danger"
              title={t('impassableLabel')}
              trailing={
                <Switch
                  value={draft.impassable}
                  onValueChange={(v) => set({ impassable: v })}
                  accessibilityLabel={t('impassableLabel')}
                  trackColor={{ true: tc.accent, false: tc.controlBorder }}
                  thumbColor={tc.white}
                />
              }
            />
          </Step>
        ) : null}
        <Step title={t('locationLabel')} error={errors.point} index={hasDetail ? 2 : 1}>
          <View style={styles.pad}>
            {draft.point ? (
              <View
                style={styles.locRow}
                accessible
                accessibilityLabel={t(locationSource === 'device' ? 'locationFromDevice' : locationSource === 'map' ? 'locationFromMap' : 'locationFromAuto', {
                  lat: draft.point.lat.toFixed(5),
                  lng: draft.point.lng.toFixed(5),
                })}
              >
                <LocationPreview point={draft.point} />
                <View style={[styles.flex, styles.locText]}>
                  <AppText variant="label" tone="accent">
                    {t(locationSource === 'device' ? 'locationDeviceLabel' : locationSource === 'map' ? 'locationMapLabel' : 'locationAutoLabel')}
                  </AppText>
                  <AppText variant="mono" testID="location-coords">
                    {draft.point.lat.toFixed(5)}
                  </AppText>
                  <AppText variant="mono">{draft.point.lng.toFixed(5)}</AppText>
                  <AppText variant="meta" tone={snap ? 'muted' : 'warn'} testID="location-road">
                    {snap ? (snap.roadName ? t('reportOnRoad', { road: snap.roadName }) : t('reportOnRoadUnnamed')) : t(liveMode ? 'reportOffMapShort' : 'reportOffRoadShort')}
                  </AppText>
                </View>
              </View>
            ) : null}
            <Segmented
              accessibilityLabel={t('locationLabel')}
              value={locationSource === 'auto' ? null : locationSource}
              onChange={(v) => {
                if (v === 'device') void takeMyLocation();
                else setPickerOpen(true);
              }}
              options={[
                { value: 'device', label: t('useMyLocation'), icon: LocateFixed },
                { value: 'map', label: t('chooseOnMap'), icon: MapPin, testID: 'choose-on-map' },
              ]}
            />
            {locationNote ? (
              <AppText variant="meta" tone="warn">
                {locationNote}
              </AppText>
            ) : null}
          </View>
        </Step>
        <Step title={t('photoLabel')} index={hasDetail ? 3 : 2} bare>
          <PhotoField photo={photo} onChange={setPhoto} />
        </Step>
        <Step title={t('noteLabel')} error={errors.note} index={hasDetail ? 4 : 3}>
          <View style={[styles.pad, styles.inputWrap, noteFocused && styles.inputFocused, errors.note ? styles.inputError : null]}>
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
        </Step>
        <Card>
          <Row
            first
            icon={Eye}
            title={t('observedLabel')}
            trailing={
              <Switch
                value={draft.observedPersonally}
                onValueChange={(v) => set({ observedPersonally: v })}
                accessibilityLabel={t('observedLabel')}
                trackColor={{ true: tc.accent, false: tc.controlBorder }}
                thumbColor={tc.white}
              />
            }
          />
        </Card>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
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
      <MapPicker
        visible={pickerOpen}
        initial={draft.point}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(point) => {
          set({ point });
          setLocationSource('map');
          setLocationNote(null);
          setPickerOpen(false);
        }}
      />
      {/* Toasts open under the header, never over the title or the status bar. */}
      <ToastHost top={headerH + spacing.xs} />
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.bold },
  header: { gap: spacing.xxs, paddingBottom: spacing.md, backgroundColor: tc.shell },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouch - spacing.xxs, marginBottom: spacing.sm },
  content: { paddingTop: spacing.xs, gap: spacing.lg },
  step: { gap: spacing.sm },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxs },
  stepNum: { width: spacing.lg, height: spacing.lg, borderRadius: radius.chip, backgroundColor: tc.accent, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fontFamily.bold, lineHeight: spacing.md + spacing.xxs },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 2, paddingHorizontal: spacing.xxs },
  pad: { padding: spacing.md, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeWrap: { flexBasis: '47%', flexGrow: 1 },
  type: {
    minHeight: layout.minTouch + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sheet,
    // Always 2 px so picking a card never nudges its neighbours.
    borderWidth: 2,
  },
  typeDisc: { width: spacing.xl + spacing.xs, height: spacing.xl + spacing.xs, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { flex: 1, fontFamily: fontFamily.semibold },
  tick: {
    position: 'absolute',
    top: spacing.xs - 2,
    right: spacing.xs - 2,
    width: spacing.md + 2,
    height: spacing.md + 2,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locText: { gap: 2 },
  preview: { width: TILE_PREVIEW, height: TILE_PREVIEW, borderRadius: radius.card, overflow: 'hidden', backgroundColor: tc.shell },
  previewCross: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Focus and error are drawn as a 2 px ring around the field, so the browser's own outline is removed on web.
  inputWrap: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.sheet },
  inputFocused: { borderColor: tc.focus },
  input: { ...text.body, color: tc.ink, minHeight: spacing.xl * 2 + spacing.sm, padding: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  inputError: { borderColor: tc.danger },
  counter: { alignSelf: 'flex-end' },
  formError: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.card, backgroundColor: tc.dangerSurface },
  // The action bar sits on the page with a soft blue lift above it, so the form scrolls under it.
  footer: {
    paddingTop: spacing.sm,
    backgroundColor: tc.panel,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: tc.panelLine,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 -10px 28px -12px ${withAlpha(tc.ink, 0.22)}` } as object)
      : { shadowColor: tc.ink, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 10 }),
  },
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
