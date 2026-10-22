import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetTextInput, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Check, Hospital, LocateFixed, MapPin, Route, Search, X, type LucideIcon } from '@/components/icons';
import { buildGazetteer, entryToPlace, searchEntries, type SearchEntry, type SearchKind } from '@/features/search/gazetteer';
import { resolveMyLocation } from '@/features/search/myLocation';
import { choosePlace, type ChooseResult, type PlaceRole } from '@/features/trip/planner';
import { t, type StringKey } from '@/i18n/en';
import { placeById, useScenario } from '@/stores/scenario';
import { useTrip } from '@/stores/trip';
import { createStyles, fontFamily, hairline, layout, radius, spacing, text, useColors } from '@/theme';

interface Props {
  /** Called after a place was set; the parent closes the sheet. */
  onChosen: () => void;
  onDismiss: () => void;
}

const KIND_ICON: Record<SearchKind, LucideIcon> = { hospital: Hospital, shelter: Hospital, landmark: MapPin, origin: MapPin, road: Route };
const NOTICE: Record<Exclude<ChooseResult, 'ok'>, StringKey> = { same: 'sameStartEnd', en_route: 'startLockedEnRoute' };

/**
 * Start and destination search, opened from the search card. Searches the scenario's places and the
 * named roads of the bundled map (offline); the start can also be the phone's position. Every pick
 * becomes a place that the engine snaps to its road graph; the sheet never routes anything itself.
 */
export const DestinationSheet = forwardRef<BottomSheetModal, Props>(function DestinationSheet({ onChosen, onDismiss }, ref) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const scenario = useScenario((s) => s.scenario);
  const graphFile = useScenario((s) => s.graphFile);
  const originId = useTrip((s) => s.originId);
  const destinationId = useTrip((s) => s.destinationId);
  const canEditFrom = useTrip((s) => s.mode === 'planning');
  const [field, setField] = useState<PlaceRole>('to');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const deferred = useDeferredValue(query);

  const origin = placeById(scenario, originId);
  const dest = placeById(scenario, destinationId);
  const entries = useMemo(() => buildGazetteer(graphFile, scenario.places), [graphFile, scenario.places]);
  const near = (field === 'from' ? dest : origin)?.point ?? null;
  const results = useMemo(() => searchEntries(entries, deferred, near), [entries, deferred, near]);
  const selectedId = field === 'from' ? originId : destinationId;
  const searching = deferred.trim().length > 0;

  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );

  const apply = useCallback(
    (role: PlaceRole, place: Place) => {
      const result = choosePlace(role, place);
      if (result === 'ok') {
        setNotice(null);
        onChosen();
      } else {
        setNotice(t(NOTICE[result]));
      }
    },
    [onChosen],
  );

  const locateMe = useCallback(async () => {
    setLocating(true);
    setNotice(null);
    const r = await resolveMyLocation();
    setLocating(false);
    if (r.ok) apply('from', r.place);
    else setNotice(t(r.reason === 'denied' ? 'myLocationDenied' : r.reason === 'outside' ? 'myLocationOutside' : 'myLocationFailed'));
  }, [apply]);

  const pickField = (role: PlaceRole) => {
    if (role === 'from' && !canEditFrom) {
      setNotice(t('startLockedEnRoute'));
      return;
    }
    setNotice(null);
    setQuery('');
    setField(role);
  };

  const reset = () => {
    setField('to');
    setQuery('');
    setNotice(null);
    setLocating(false);
    onDismiss();
  };

  const renderItem = ({ item }: { item: SearchEntry }) => {
    const selected = item.id === selectedId;
    const Icon = KIND_ICON[item.kind];
    const sub = item.subtitle || t('placeRoad');
    return (
      <Pressable
        onPress={() => apply(field, entryToPlace(item, scenario.places))}
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

  const header = (
    <View style={styles.header}>
      <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.title}>
        {t('planTripTitle')}
      </AppText>
      <View style={styles.fields}>
        <FieldRow role="from" active={field === 'from'} disabled={!canEditFrom} label={t('fromEyebrow')} name={origin?.name ?? t('searchFromPlaceholder')} onPress={pickField} />
        <FieldRow role="to" active={field === 'to'} label={t('destinationEyebrow')} name={dest?.name ?? t('searchPlaceholder')} onPress={pickField} />
      </View>
      <View style={styles.inputWrap}>
        <Search size={18} color={tc.inkMuted} />
        <BottomSheetTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t(field === 'from' ? 'searchFromPlaceholder' : 'searchToPlaceholder')}
          placeholderTextColor={tc.inkMuted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          maxLength={80}
          accessibilityLabel={t(field === 'from' ? 'searchFromPlaceholder' : 'searchToPlaceholder')}
          testID="place-search-input"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={spacing.sm} accessibilityRole="button" accessibilityLabel={t('searchClear')}>
            <X size={18} color={tc.inkMuted} />
          </Pressable>
        ) : null}
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
        <AppText variant="meta" tone="muted" accessibilityLiveRegion="polite" style={styles.notice}>
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

function FieldRow({ role, active, disabled, label, name, onPress }: { role: PlaceRole; active: boolean; disabled?: boolean; label: string; name: string; onPress: (r: PlaceRole) => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onPress(role)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      style={[styles.field, active && styles.fieldActive, disabled && styles.fieldDisabled]}
      testID={`field-${role}`}
    >
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <AppText variant="body" style={styles.name} numberOfLines={1}>
        {name}
      </AppText>
    </Pressable>
  );
}

const useStyles = createStyles((tc) => ({
  bg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine },
  content: { paddingHorizontal: spacing.md },
  header: { gap: spacing.xs, paddingBottom: spacing.xs },
  flex: { flex: 1 },
  title: { marginBottom: spacing.xxs },
  section: { marginTop: spacing.xs },
  name: { fontFamily: fontFamily.semibold },
  fields: { flexDirection: 'row', gap: spacing.xs },
  field: {
    flex: 1,
    minHeight: layout.minTouch + spacing.xs,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.panelRaised,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
  },
  fieldActive: { borderColor: tc.ink, borderWidth: 1.5 },
  fieldDisabled: { opacity: 0.55 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.panelSunken,
  },
  input: { ...text.body, flex: 1, color: tc.ink, paddingVertical: spacing.xs },
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
