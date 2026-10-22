import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haversineM } from '@vighnaway/engine';
import type { LatLng, Place } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import {
  ArrowUpDown,
  Building,
  Check,
  CircleDot,
  Clock,
  Hospital,
  House,
  Landmark,
  LocateFixed,
  MapPin,
  Plane,
  Route,
  School,
  SearchX,
  ShoppingBag,
  TrainFront,
  WifiOff,
  X,
  type LucideIcon,
} from '@/components/icons';
import { GEOCODER_URL } from '@/config/env';
import { buildGazetteer, entryToPlace, searchEntries, type SearchEntry, type SearchKind } from '@/features/search/gazetteer';
import { resolveMyLocation } from '@/features/search/myLocation';
import { MIN_QUERY, useOnlineSearch } from '@/features/search/useOnlineSearch';
import { useRecentPlaces, type RecentPlace } from '@/features/search/recent';
import type { OnlinePlace } from '@/features/search/onlineSearch';
import { choosePlace, setTripPlaces, type ChooseResult, type PlaceRole } from '@/features/trip/planner';
import { t, type StringKey } from '@/i18n/en';
import { graphForRegion, northPlaces, regionBox, regionOfPoint } from '@/regions';
import { placeById, useScenario } from '@/stores/scenario';
import { useToast } from '@/stores/toast';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, fontFamily, hairline, layout, radius, spacing, text, useColors } from '@/theme';

interface Props {
  /** Called after a place was set (or to close the sheet); the parent closes it. */
  onChosen: () => void;
  onDismiss: () => void;
}

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  hospital: Hospital,
  shelter: Hospital,
  landmark: Landmark,
  origin: MapPin,
  road: Route,
  city: Building,
  town: Building,
  village: House,
  station: TrainFront,
  airport: Plane,
  shop: ShoppingBag,
  school: School,
  poi: MapPin,
};
const KIND_LABEL: Partial<Record<SearchKind, StringKey>> = {
  city: 'placeCity',
  town: 'placeTown',
  village: 'placeVillage',
  hospital: 'placeHospital',
  station: 'placeStation',
  airport: 'placeAirport',
  shop: 'placeShop',
  school: 'placeSchool',
  landmark: 'placeLandmark',
  poi: 'placePoi',
};
const NOTICE: Record<Exclude<ChooseResult, 'ok'>, StringKey> = {
  same: 'sameStartEnd',
  en_route: 'startLockedEnRoute',
  outside: 'tripOutside',
  different_regions: 'tripDifferentArea',
  no_road: 'tripNoRoad',
};

/** Two results this close with the same name are one place. */
const SAME_PLACE_M = 150;
const BUILTIN_WHILE_TYPING = 4;
const BUILTIN_SUGGESTED = 6;

/** The place for a field: undefined = still the trip's own, null = emptied or being typed over. */
type DraftPlace = Place | null | undefined;
interface Draft {
  from: DraftPlace;
  to: DraftPlace;
}
const FRESH: Draft = { from: undefined, to: undefined };
const NO_TEXT: Record<PlaceRole, string | null> = { from: null, to: null };
const other = (r: PlaceRole): PlaceRole => (r === 'from' ? 'to' : 'from');

type Source = 'recent' | 'builtin' | 'online';
type Row =
  | { type: 'header'; key: string; title: string }
  | { type: 'status'; key: string; tone: 'loading' | 'info'; text: string; icon?: LucideIcon }
  | { type: 'place'; key: string; entry: SearchEntry; source: Source };

/** A searched or remembered place as a list entry (it is only a point: the planner snaps it to a road). */
const entryOf = (p: OnlinePlace | RecentPlace): SearchEntry => ({ id: p.id, name: p.name, subtitle: p.subtitle, kind: p.kind, point: p.point, nodeId: '', haystack: '', nameKey: '' });

/**
 * Trip search, opened from the search card: a From input above a To input. As you type it lists real
 * places with their addresses from a live search (OpenStreetMap data), after the built-in places and
 * your recent picks, which answer instantly and work offline. The start can also be the phone's
 * position. Both ends must be on the same road map (Andheri, or the Amritsar to Ambala corridor): a
 * result somewhere with no road map is shown as such, and picking a place on the other map empties
 * the other field so the pair is always routable. The sheet never routes anything itself:
 * setTripPlaces hands the pair to the engine.
 */
export const DestinationSheet = forwardRef<BottomSheetModal, Props>(function DestinationSheet({ onChosen, onDismiss }, ref) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const scenario = useScenario((s) => s.scenario);
  const region = useScenario((s) => s.region);
  const originId = useTrip((s) => s.originId);
  const destinationId = useTrip((s) => s.destinationId);
  const canEditFrom = useTrip((s) => s.mode === 'planning');
  const recent = useRecentPlaces((s) => s.places);
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
  const typed = deferred.trim();
  const searching = typed.length > 0;
  // Built-in: Andheri roads and places plus the corridor's cities and towns. Instant and offline.
  const entries = useMemo(() => buildGazetteer(graphForRegion('andheri'), scenario.places, northPlaces()), [scenario.places]);
  // Results favour the area of the other end, else the map the trip is on.
  const bias = useMemo<LatLng>(() => {
    const o = placeOf(other(field))?.point;
    if (o) return o;
    const b = regionBox(region);
    return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, fromPlace, toPlace, region]);
  const online = useOnlineSearch(typed, bias);
  const selectedId = placeOf(field)?.id;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!searching) {
      if (recent.length) {
        out.push({ type: 'header', key: 'h-recent', title: t('searchRecent') });
        for (const r of recent) out.push({ type: 'place', key: `r-${r.id}`, entry: entryOf(r), source: 'recent' });
      }
      const suggested = searchEntries(entries, '', null, BUILTIN_SUGGESTED).filter((e) => !recent.some((r) => r.id === e.id));
      if (suggested.length) out.push({ type: 'header', key: 'h-suggested', title: t('searchSuggested') });
      for (const e of suggested) out.push({ type: 'place', key: `b-${e.id}`, entry: e, source: 'builtin' });
      return out;
    }
    const near = placeOf(other(field))?.point ?? null;
    const builtin = searchEntries(entries, typed, near, BUILTIN_WHILE_TYPING);
    if (builtin.length) {
      out.push({ type: 'header', key: 'h-builtin', title: t('searchBuiltIn') });
      for (const e of builtin) out.push({ type: 'place', key: `b-${e.id}`, entry: e, source: 'builtin' });
    }
    const fresh = online.places.filter((p) => !builtin.some((b) => b.id === p.id || (b.name.toLowerCase() === p.name.toLowerCase() && haversineM(b.point, p.point) < SAME_PLACE_M)));
    if (fresh.length) {
      out.push({ type: 'header', key: 'h-online', title: t('searchPlaces') });
      for (const p of fresh) out.push({ type: 'place', key: `o-${p.id}`, entry: entryOf(p), source: 'online' });
    }
    if (typed.length >= MIN_QUERY && GEOCODER_URL) {
      if (online.status === 'loading' && !fresh.length) out.push({ type: 'status', key: 's-loading', tone: 'loading', text: t('searchSearching') });
      else if (online.status === 'offline') out.push({ type: 'status', key: 's-offline', tone: 'info', text: t('searchOnlineOffline'), icon: WifiOff });
      else if (online.status === 'error') out.push({ type: 'status', key: 's-error', tone: 'info', text: t('searchOnlineError'), icon: WifiOff });
    }
    if (!out.length && online.status !== 'loading') out.push({ type: 'status', key: 's-none', tone: 'info', text: t('searchNoResults'), icon: SearchX });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, typed, entries, online, recent, field, fromPlace, toPlace]);

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

  const pick = (role: PlaceRole, place: Place, entry?: SearchEntry) => {
    const placeRegion = regionOfPoint(place.point);
    if (!placeRegion) {
      setNotice(t('tripNoMapFor', { place: place.name }));
      return;
    }
    // Remembered for next time (on this phone only).
    useRecentPlaces.getState().remember({
      id: place.id,
      name: place.name,
      subtitle: entry?.subtitle ?? place.address ?? '',
      kind: entry?.kind ?? 'poi',
      point: place.point,
    });
    const o = other(role);
    const otherPlace = placeOf(o);
    if (!canEditFrom) {
      finish(placeById(scenario, originId) ?? place, place);
      return;
    }
    const otherRegion = otherPlace ? regionOfPoint(otherPlace.point) : null;
    if (otherPlace && otherRegion && otherRegion !== placeRegion) {
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
    if (!canEditFrom) {
      setNotice(t('startLockedEnRoute'));
      return;
    }
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

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionRow}>
          {item.title === t('searchRecent') ? <Clock size={14} color={tc.inkMuted} /> : null}
          <AppText variant="label" tone="muted" accessibilityRole="header">
            {item.title}
          </AppText>
        </View>
      );
    }
    if (item.type === 'status') {
      const Icon = item.icon;
      return (
        <View style={styles.status} accessibilityLiveRegion="polite" testID={`search-${item.key}`}>
          {item.tone === 'loading' ? <ActivityIndicator size="small" color={tc.inkMuted} /> : Icon ? <Icon size={16} color={tc.inkMuted} /> : null}
          <AppText variant="meta" tone="muted" style={styles.flex}>
            {item.text}
          </AppText>
        </View>
      );
    }
    const { entry } = item;
    const selected = entry.id === selectedId;
    const Icon = KIND_ICON[entry.kind];
    const labelKey = KIND_LABEL[entry.kind];
    const sub = entry.subtitle || t(labelKey ?? 'placeRoad');
    const hasMap = regionOfPoint(entry.point) !== null;
    return (
      <Pressable
        onPress={() => pick(field, entryToPlace(entry, scenario.places), entry)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}. ${sub}${hasMap ? '' : `. ${t('searchNoMap')}`}`}
        accessibilityState={{ selected }}
        style={[styles.row, selected && styles.rowSelected]}
        testID={`place-${entry.id}`}
      >
        <View style={[styles.icon, hasMap ? styles.iconMap : null, selected && styles.iconSelected]}>
          <Icon size={18} color={selected ? tc.panel : hasMap ? tc.accentInk : tc.inkMuted} strokeWidth={2.1} />
        </View>
        <View style={styles.flex}>
          <AppText variant="body" style={styles.name} numberOfLines={1}>
            {entry.name}
          </AppText>
          <AppText variant="meta" tone="muted" numberOfLines={1}>
            {sub}
          </AppText>
        </View>
        {selected ? (
          <Check size={20} color={tc.ink} strokeWidth={2.5} />
        ) : hasMap ? null : (
          <View style={styles.noMap} testID={`no-map-${entry.id}`}>
            <AppText variant="label" tone="muted" style={styles.noMapText}>
              {t('searchNoMap')}
            </AppText>
          </View>
        )}
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
    const busy = active && online.status === 'loading' && typed.length >= MIN_QUERY;
    return (
      <View style={[styles.inputRow, active && styles.inputRowActive, locked && styles.locked]} testID={`field-${role}`}>
        <View style={styles.flex}>
          <AppText variant="label" tone={active ? 'accent' : 'muted'}>
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
        {busy ? <ActivityIndicator size="small" color={tc.inkMuted} /> : null}
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
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header" style={styles.flex}>
          {t('planTripTitle')}
        </AppText>
        <Pressable onPress={onChosen} hitSlop={spacing.sm} accessibilityRole="button" accessibilityLabel={t('searchClose')} style={styles.close} testID="search-close">
          <X size={18} color={tc.ink} />
        </Pressable>
      </View>
      <View style={styles.fieldsRow}>
        <View style={[styles.card, styles.flex]}>
          <View style={styles.rail} accessible={false}>
            <CircleDot size={18} color={tc.accentInk} strokeWidth={2.4} />
            <View style={styles.dots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.dot} />
              ))}
            </View>
            <MapPin size={18} color={tc.dangerInk} strokeWidth={2.4} />
          </View>
          <View style={styles.flex}>
            {inputRow('from')}
            <View style={styles.cardDivider} />
            {inputRow('to')}
          </View>
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
      <Pressable
        onPress={locateMe}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel={t('myLocation')}
        accessibilityHint={t('myLocationHint')}
        style={[styles.pill, !canEditFrom && styles.locked]}
        testID="use-my-location"
      >
        {locating ? <ActivityIndicator size="small" color={tc.accentInk} /> : <LocateFixed size={16} color={tc.accentInk} strokeWidth={2.3} />}
        <AppText variant="label" style={styles.pillText}>
          {t(locating ? 'myLocationLocating' : 'myLocation')}
        </AppText>
      </Pressable>
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <AppText variant="meta" tone="warn" testID="search-notice">
            {notice}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['92%']}
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
      <BottomSheetFlatList<Row>
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={
          <AppText variant="meta" tone="muted" style={styles.coverage} testID="search-credit">
            {GEOCODER_URL ? t('searchOnlineCredit') : t('searchCoverage')}
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

const RAIL = spacing.xl;

const useStyles = createStyles((tc) => ({
  bg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine },
  content: { paddingHorizontal: spacing.md },
  header: { gap: spacing.sm, paddingBottom: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxs },
  close: { width: spacing.xl + spacing.xs, height: spacing.xl + spacing.xs, borderRadius: radius.chip, backgroundColor: tc.panelSunken, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fontFamily.semibold },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: { flexDirection: 'row', alignItems: 'stretch', borderRadius: radius.card, backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline, overflow: 'hidden', paddingLeft: spacing.sm },
  // The start dot and the destination pin, joined by a dotted line, run down the left of both inputs.
  rail: { width: RAIL - spacing.xs, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs },
  dots: { gap: spacing.xxs, alignItems: 'center', paddingVertical: spacing.xxs },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: tc.inkSubtle },
  cardDivider: { height: hairline, backgroundColor: tc.panelHairline },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: layout.minTouch + spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  inputRowActive: { backgroundColor: tc.panel },
  locked: { opacity: 0.55 },
  input: { ...text.body, color: tc.ink, paddingVertical: spacing.xxs, paddingHorizontal: 0, fontFamily: fontFamily.semibold },
  swap: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouch - spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    backgroundColor: tc.tealSoft,
  },
  pillText: { color: tc.accentInk, fontFamily: fontFamily.semibold },
  notice: { paddingHorizontal: spacing.xxs },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 2, paddingTop: spacing.sm, paddingBottom: spacing.xxs, paddingHorizontal: spacing.xxs },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card, backgroundColor: tc.panelSunken },
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
  iconMap: { backgroundColor: tc.tealSoft },
  iconSelected: { backgroundColor: tc.ink },
  noMap: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.chip, backgroundColor: tc.panelSunken, maxWidth: '38%' },
  noMapText: { textAlign: 'center' },
}));
