import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { ArrowUpDown, Building, Check, CircleDot, House, Hospital, LocateFixed, MapPin, Route, X, type LucideIcon } from '@/components/icons';
import { buildGazetteer, entryToPlace, searchEntries, type SearchEntry, type SearchKind } from '@/features/search/gazetteer';
import { resolveMyLocation } from '@/features/search/myLocation';
import { choosePlace, setTripPlaces, type ChooseResult, type PlaceRole } from '@/features/trip/planner';
import { t, type StringKey } from '@/i18n/en';
import { graphForRegion, northPlaces, regionOfPoint } from '@/regions';
import { placeById, useScenario } from '@/stores/scenario';
import { useToast } from '@/stores/toast';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, fontFamily, hairline, layout, radius, spacing, text, useColors } from '@/theme';

interface Props {
  /** Called after a place was set; the parent closes the sheet. */
  onChosen: () => void;
  onDismiss: () => void;
}

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  hospital: Hospital,
  shelter: Hospital,
  landmark: MapPin,
  origin: MapPin,
  road: Route,
  city: Building,
  town: MapPin,
  village: House,
};
const KIND_LABEL: Partial<Record<SearchKind, StringKey>> = { city: 'placeCity', town: 'placeTown', village: 'placeVillage' };
const NOTICE: Record<Exclude<ChooseResult, 'ok'>, StringKey> = {
  same: 'sameStartEnd',
  en_route: 'startLockedEnRoute',
  outside: 'tripOutside',
  different_regions: 'tripDifferentArea',
  no_road: 'tripNoRoad',
};

/** The place for a field: undefined = still the trip's own, null = emptied or being typed over. */
type DraftPlace = Place | null | undefined;
interface Draft {
  from: DraftPlace;
  to: DraftPlace;
}
const FRESH: Draft = { from: undefined, to: undefined };
const NO_TEXT: Record<PlaceRole, string | null> = { from: null, to: null };
const other = (r: PlaceRole): PlaceRole => (r === 'from' ? 'to' : 'from');

/**
 * Trip search, opened from the search card: a From input above a To input. It searches offline over
 * the Andheri places and roads and the cities and towns from Amritsar to Ambala; the start can also
 * be the phone's position. Both ends must be on the same map (Andheri, or the corridor): picking a
 * place on the other map empties the other field, so the pair is always routable. The sheet never
 * routes anything itself: setTripPlaces hands the pair to the engine.
 */
export const DestinationSheet = forwardRef<BottomSheetModal, Props>(function DestinationSheet({ onChosen, onDismiss }, ref) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const scenario = useScenario((s) => s.scenario);
  const originId = useTrip((s) => s.originId);
  const destinationId = useTrip((s) => s.destinationId);
  const canEditFrom = useTrip((s) => s.mode === 'planning');
  const [field, setField] = useState<PlaceRole>('to');
  const [draft, setDraft] = useState<Draft>(FRESH);
  const [texts, setTexts] = useState(NO_TEXT);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const fromRef = useRef<TextInputInstance>(null);
  const toRef = useRef<TextInputInstance>(null);

  const fromPlace = draft.from === undefined ? placeById(scenario, originId) : draft.from;
  const toPlace = draft.to === undefined ? placeById(scenario, destinationId) : draft.to;
  const placeOf = (r: PlaceRole) => (r === 'from' ? fromPlace : toPlace);

  const query = texts[field] ?? '';
  const deferred = useDeferredValue(query);
  const searching = deferred.trim().length > 0;
  // Andheri roads and places, plus the corridor's cities and towns: one list whatever map is showing.
  const entries = useMemo(() => buildGazetteer(graphForRegion('andheri'), scenario.places, northPlaces()), [scenario.places]);
  const near = placeOf(other(field))?.point ?? null;
  const results = useMemo(() => searchEntries(entries, deferred, near), [entries, deferred, near]);
  const selectedId = placeOf(field)?.id;

  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );

  const focus = (r: PlaceRole) => setTimeout(() => (r === 'from' ? fromRef : toRef).current?.focus(), 60);

  const finish = (from: Place, to: Place) => {
    // En route only the destination can change (the vehicle is the start).
    const result = canEditFrom ? setTripPlaces(from, to) : choosePlace('to', to);
    if (result === 'ok') {
      setNotice(null);
      onChosen();
    } else {
      setNotice(t(NOTICE[result]));
    }
  };

  const pick = (role: PlaceRole, place: Place) => {
    const region = regionOfPoint(place.point);
    if (!region) {
      setNotice(t(NOTICE.outside));
      return;
    }
    const o = other(role);
    const otherPlace = placeOf(o);
    if (!canEditFrom) {
      finish(placeById(scenario, originId) ?? place, place);
      return;
    }
    const otherRegion = otherPlace ? regionOfPoint(otherPlace.point) : null;
    if (otherPlace && otherRegion && otherRegion !== region) {
      // The other end is on another map: it has to be chosen again, in this area.
      setDraft((d) => ({ ...d, [role]: place, [o]: null }));
      setTexts((x) => ({ ...x, [role]: null, [o]: '' }));
      setNotice(t(o === 'from' ? 'tripPickOtherFrom' : 'tripPickOtherTo'));
      setField(o);
      focus(o);
      return;
    }
    setDraft((d) => ({ ...d, [role]: place }));
    setTexts((x) => ({ ...x, [role]: null }));
    setNotice(null);
    if (otherPlace) {
      finish(role === 'from' ? place : otherPlace, role === 'to' ? place : otherPlace);
    } else {
      setField(o);
      focus(o);
    }
  };

  const locateMe = async () => {
    setLocating(true);
    setNotice(null);
    const r = await resolveMyLocation();
    setLocating(false);
    if (!r.ok) {
      setNotice(t(r.reason === 'denied' ? 'myLocationDenied' : r.reason === 'outside' ? 'myLocationOutside' : 'myLocationFailed'));
      return;
    }
    pick('from', r.place);
    // An approximate start is still used: say so in a toast, as the sheet may close.
    if (r.approximate) {
      useToast.getState().show(
        useUi.getState().locationPermission === 'approximate' ? t('myLocationApproximatePermission') : t('myLocationApproximate', { m: Math.round(r.accuracyM ?? 0) }),
        'warn',
      );
    }
  };

  const onChangeText = (role: PlaceRole, value: string) => {
    setTexts((x) => ({ ...x, [role]: value }));
    setDraft((d) => ({ ...d, [role]: null }));
    setNotice(null);
  };

  const clear = (role: PlaceRole) => {
    onChangeText(role, '');
    focus(role);
  };

  const focusField = (role: PlaceRole) => {
    if (role === 'from' && !canEditFrom) {
      setNotice(t('startLockedEnRoute'));
      fromRef.current?.blur();
      return;
    }
    setField(role);
  };

  const swap = () => {
    if (!canEditFrom) return;
    const a = fromPlace;
    const b = toPlace;
    setDraft({ from: b, to: a });
    setTexts(NO_TEXT);
    setNotice(null);
    if (a && b) finish(b, a);
  };

  const reset = () => {
    setField('to');
    setDraft(FRESH);
    setTexts(NO_TEXT);
    setNotice(null);
    setLocating(false);
    onDismiss();
  };

  const renderItem = ({ item }: { item: SearchEntry }) => {
    const selected = item.id === selectedId;
    const Icon = KIND_ICON[item.kind];
    const labelKey = KIND_LABEL[item.kind];
    const sub = item.subtitle || t(labelKey ?? 'placeRoad');
    return (
      <Pressable
        onPress={() => pick(field, entryToPlace(item, scenario.places))}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}. ${sub}`}
        accessibilityState={{ selected }}
        style={[styles.row, selected && styles.rowSelected]}
        testID={`place-${item.id}`}
      >
        <View style={[styles.icon, selected && styles.iconSelected]}>
          <Icon size={18} color={selected ? tc.panel : tc.ink} />
        </View>
        <View style={styles.flex}>
          <AppText variant="body" style={styles.name} numberOfLines={2}>
            {item.name}
          </AppText>
          <AppText variant="meta" tone="muted" numberOfLines={1}>
            {sub}
          </AppText>
        </View>
        {selected ? <Check size={20} color={tc.ink} strokeWidth={2.5} /> : null}
      </Pressable>
    );
  };

  const inputRow = (role: PlaceRole) => {
    const place = placeOf(role);
    const active = field === role;
    const locked = role === 'from' && !canEditFrom;
    const label = t(role === 'from' ? 'fromEyebrow' : 'destinationEyebrow');
    const placeholder = t(role === 'from' ? 'searchFromPlaceholder' : 'searchToPlaceholder');
    const value = texts[role] ?? place?.name ?? '';
    const Icon = role === 'from' ? CircleDot : MapPin;
    return (
      <View style={[styles.inputRow, active && styles.inputRowActive, locked && styles.locked]} testID={`field-${role}`}>
        <Icon size={18} color={role === 'from' ? tc.accentInk : tc.dangerInk} strokeWidth={2.4} />
        <View style={styles.flex}>
          <AppText variant="label" tone="muted">
            {label}
          </AppText>
          <BottomSheetTextInput
            ref={(role === 'from' ? fromRef : toRef) as never}
            value={value}
            onChangeText={(v: string) => onChangeText(role, v)}
            onFocus={() => focusField(role)}
            placeholder={placeholder}
            placeholderTextColor={tc.inkMuted}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            selectTextOnFocus
            // A field that is not being edited shows the start of its text, not wherever it was scrolled to.
            selection={active ? undefined : { start: 0, end: 0 }}
            returnKeyType="search"
            maxLength={80}
            editable={!locked}
            accessibilityLabel={`${label}: ${placeholder}`}
            testID={role === 'from' ? 'place-from-input' : 'place-search-input'}
          />
        </View>
        {value && !locked ? (
          <Pressable onPress={() => clear(role)} hitSlop={spacing.sm} accessibilityRole="button" accessibilityLabel={t('searchClear')}>
            <X size={18} color={tc.inkMuted} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const header = (
    <View style={styles.header}>
      <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.title}>
        {t('planTripTitle')}
      </AppText>
      <View style={styles.fieldsRow}>
        <View style={[styles.card, styles.flex]}>
          {inputRow('from')}
          <View style={styles.cardDivider} />
          {inputRow('to')}
        </View>
        <Pressable
          onPress={swap}
          disabled={!canEditFrom}
          accessibilityRole="button"
          accessibilityLabel={t('swapPlaces')}
          style={[styles.swap, !canEditFrom && styles.locked]}
          testID="swap-places"
        >
          <ArrowUpDown size={18} color={tc.ink} strokeWidth={2.4} />
        </Pressable>
      </View>
      {field === 'from' && !searching ? (
        <Pressable onPress={locateMe} disabled={locating} accessibilityRole="button" accessibilityLabel={t('myLocation')} style={styles.row} testID="use-my-location">
          <View style={styles.icon}>{locating ? <ActivityIndicator size="small" color={tc.ink} /> : <LocateFixed size={18} color={tc.ink} />}</View>
          <View style={styles.flex}>
            <AppText variant="body" style={styles.name}>
              {t('myLocation')}
            </AppText>
            <AppText variant="meta" tone="muted">
              {t(locating ? 'myLocationLocating' : 'myLocationHint')}
            </AppText>
          </View>
        </Pressable>
      ) : null}
      {notice ? (
        <AppText variant="meta" tone="muted" accessibilityLiveRegion="polite" style={styles.notice} testID="search-notice">
          {notice}
        </AppText>
      ) : null}
      <AppText variant="label" tone="muted" style={styles.section}>
        {t(searching ? 'searchResults' : 'searchSuggested')}
      </AppText>
    </View>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['88%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={(index) => {
        // Opens ready to type the destination.
        if (index >= 0 && field === 'to') focus('to');
      }}
      onDismiss={reset}
      backdropComponent={backdrop}
      topInset={insets.top}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetFlatList<SearchEntry>
        data={results}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <AppText variant="body" tone="muted" style={styles.empty}>
            {t('searchNoResults')}
          </AppText>
        }
        ListFooterComponent={
          <AppText variant="meta" tone="muted" style={styles.coverage}>
            {t('searchCoverage')}
          </AppText>
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
        ItemSeparatorComponent={Separator}
      />
    </BottomSheetModal>
  );
});

function Separator() {
  return <View style={{ height: spacing.xs }} />;
}

const useStyles = createStyles((tc) => ({
  bg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine },
  content: { paddingHorizontal: spacing.md },
  header: { gap: spacing.xs, paddingBottom: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  title: { marginBottom: spacing.xxs },
  section: { marginTop: spacing.xs },
  name: { fontFamily: fontFamily.semibold },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: { borderRadius: radius.card, backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline, overflow: 'hidden' },
  cardDivider: { height: hairline, backgroundColor: tc.panelHairline, marginLeft: spacing.xl + spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.minTouch + spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  inputRowActive: { backgroundColor: tc.panel, borderLeftWidth: 3, borderLeftColor: tc.accent, paddingLeft: spacing.sm - 3 },
  locked: { opacity: 0.55 },
  input: { ...text.body, color: tc.ink, paddingVertical: spacing.xxs, paddingHorizontal: 0, fontFamily: fontFamily.semibold },
  swap: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline },
  notice: { paddingHorizontal: spacing.xxs },
  empty: { paddingVertical: spacing.md, textAlign: 'center' },
  coverage: { paddingTop: spacing.md, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch + spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.panelRaised,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
  },
  rowSelected: { borderColor: tc.ink, borderWidth: 1.5 },
  icon: { width: spacing.xl + spacing.xxs, height: spacing.xl + spacing.xxs, borderRadius: radius.button - 2, backgroundColor: tc.panelSunken, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: tc.ink },
}));
