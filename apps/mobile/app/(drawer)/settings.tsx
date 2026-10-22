import { formatSimClock, PROFILES, type Profile } from '@vighnaway/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { ChoiceGrid } from '@/components/ChoiceGrid';
import { Accessibility, BellRing, Bike, Car, ChevronDown, ChevronRight, CircleCheck, FlaskConical, Footprints, HardDrive, Lightbulb, MapIcon, Moon, Radio, Server, ServerOff, Smartphone, Sun, TypeIcon, UserRound, Volume2, type LucideIcon } from '@/components/icons';
import { LiveBadge, SimulatedBadge } from '@/components/EvidenceChips';
import { PressScale } from '@/components/motion';
import { Card, GUTTER, Row, ScreenHeader, Section, StatusBarScrim } from '@/components/ui';
import { switchDataMode } from '@/features/live/mode';
import { usePausePlanning } from '@/hooks/usePausePlanning';
import { Segmented } from '@/components/Segmented';
import { appVersion } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { LANGUAGES, type Language } from '@/i18n/lang';
import { api } from '@/lib/api';
import { KEYS, storage } from '@/lib/storage';
import { useCommute } from '@/features/commute/commute';
import { useActivity } from '@/stores/activity';
import { showDialog } from '@/stores/dialog';
import { selectSignedIn, useAuth } from '@/stores/auth';
import { useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useTrip } from '@/stores/trip';
import { useSettings, type Appearance, type DataMode } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, fontFamily, glow, hairline, layout, radius, shadow, spacing, text, useBrand, useColors } from '@/theme';

const PROFILE_LABEL = { car: 'profileCar', two_wheeler: 'profileTwoWheeler', foot: 'profileFoot', step_free: 'profileStepFree' } as const;
const PROFILE_ICON = { car: Car, two_wheeler: Bike, foot: Footprints, step_free: Accessibility } as const;

const LANG_NATIVE: Record<Language, StringKey> = { en: 'langEn', hi: 'langHi', mr: 'langMr' };
const LANG_ENGLISH: Record<Language, StringKey> = { en: 'languageEnglish', hi: 'languageHindi', mr: 'languageMarathi' };

/** A switch row: icon tile, label and its explanation, the switch on the right. */
function SwitchRow({ icon, label, hint, value, onChange, testID, first }: { icon: LucideIcon; label: string; hint: string; value: boolean; onChange: (v: boolean) => void; testID?: string; first?: boolean }) {
  const tc = useColors();
  return (
    <Row
      icon={icon}
      title={label}
      subtitle={hint}
      first={first}
      trailing={
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          accessibilityHint={hint}
          trackColor={{ true: tc.accent, false: tc.controlBorder }}
          thumbColor={tc.white}
          testID={testID}
        />
      }
    />
  );
}

/** The account entry: a deep solid card with who is signed in, so the first thing in Settings is you. */
function AccountCard({ subtitle, onPress }: { subtitle: string | null; onPress: () => void }) {
  const tc = useColors();
  const brand = useBrand();
  const styles = useStyles();
  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={t('drawerAccount')}
      style={[styles.accountCard, { backgroundColor: brand.hero, borderColor: brand.heroEdge }, shadow('md')]}
      testID="settings-account"
    >
      <View style={[styles.accountTile, glow(tc.accent, 0.5)]}>
        <UserRound size={22} color={tc.onAccent} strokeWidth={2.25} />
      </View>
      <View style={styles.flex}>
        <AppText variant="title" style={{ color: brand.onHero }}>
          {t('drawerAccount')}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" style={{ color: brand.onHeroMuted }} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <ChevronRight size={20} color={brand.onHeroMuted} />
    </PressScale>
  );
}

export default function SettingsScreen() {
  usePausePlanning();
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const dataMode = useSettings((s) => s.dataMode);
  const appearance = useSettings((s) => s.appearance);
  const googleTraffic = useSettings((s) => s.googleTraffic);
  const language = useSettings((s) => s.language);
  const largerText = useSettings((s) => s.largerText);
  const speakChanges = useSettings((s) => s.speakChanges);
  const preferLit = useSettings((s) => s.preferLit);
  const commute = useCommute((s) => s.saved);
  const signedIn = useAuth(selectSignedIn);
  const accountEmail = useAuth((s) => s.user?.email ?? null);
  // Offer Live only when this server lists a live scenario (the API may not have it yet).
  const [liveOffered, setLiveOffered] = useState<'checking' | 'yes' | 'no'>('checking');
  const profile = useSettings((s) => s.profile);
  const apiUrl = useSettings((s) => s.apiUrl);
  const cachedAtSimS = useIncidents((s) => s.cachedAtSimS);
  const clockStartsAt = useScenario((s) => s.scenario.clockStartsAt);
  const [draftUrl, setDraftUrl] = useState(apiUrl);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const taps = useRef(0);

  useEffect(() => {
    let alive = true;
    setLiveOffered('checking');
    api
      .scenarios(apiUrl)
      .then((r) => alive && setLiveOffered(r.scenarios.some((sc) => sc.mode === 'live') ? 'yes' : 'no'))
      .catch(() => alive && setLiveOffered('no'));
    return () => {
      alive = false;
    };
  }, [apiUrl]);

  // Saves the trip on the map, with the usual fastest route as the one it normally takes.
  const saveCommute = () => {
    const trip = useTrip.getState();
    const plan = trip.plan;
    const usual = plan?.routes.find((r) => r.routeId === (plan.usualFastestRouteId ?? plan.recommendedRouteId));
    const sc = useScenario.getState().scenario;
    const from = placeById(sc, trip.originId);
    const to = placeById(sc, trip.destinationId);
    if (!plan || !usual || !from || !to || !trip.originId || !trip.destinationId) {
      useToast.getState().show(t('commuteNoTrip'));
      return;
    }
    useCommute.getState().save({ originId: trip.originId, destinationId: trip.destinationId, originName: from.name, destinationName: to.name, profile, usualRouteId: usual.routeId, usualName: usual.name });
  };

  const chooseMode = (mode: DataMode) => {
    if (mode === dataMode) return;
    showDialog({
      title: t('switchModeTitle'),
      message: t(mode === 'live' ? 'switchModeToLive' : 'switchModeToSimulated'),
      icon: mode === 'live' ? Radio : FlaskConical,
      actions: [
        { label: t('switchServerConfirm'), kind: 'primary', onPress: () => switchDataMode(mode) },
        { label: t('switchServerCancel'), kind: 'secondary' },
      ],
    });
  };

  const validUrl = (u: string) => /^https?:\/\/[^\s/]+/i.test(u.trim());

  const save = () => {
    const url = draftUrl.trim().replace(/\/+$/, '');
    if (!validUrl(url)) {
      setTestResult({ ok: false, text: t('serverInvalid') });
      return;
    }
    if (url === apiUrl) return;
    showDialog({
      title: t('switchServerTitle'),
      message: t('switchServerBody', { url }),
      icon: Server,
      actions: [
        { label: t('switchServerConfirm'), kind: 'primary', onPress: () => useSettings.getState().setApiUrl(url) },
        { label: t('switchServerCancel'), kind: 'secondary' },
      ],
    });
  };

  const test = async () => {
    const url = draftUrl.trim().replace(/\/+$/, '');
    if (!validUrl(url)) {
      setTestResult({ ok: false, text: t('serverInvalid') });
      return;
    }
    setTesting(true);
    try {
      const h = await api.health(url);
      setTestResult({ ok: true, text: t('serverConnected', { version: h.version }) });
    } catch {
      setTestResult({ ok: false, text: t('serverUnreachable', { url }) });
    } finally {
      setTesting(false);
    }
  };

  const clearCache = () =>
    showDialog({
      title: t('clearCacheTitle'),
      message: t('clearCacheBody'),
      icon: HardDrive,
      tone: 'warn',
      actions: [
        {
          label: t('clearCacheConfirm'),
          kind: 'danger',
          onPress: () => {
            useIncidents.getState().clearCache();
            useActivity.getState().clear();
            storage.remove(KEYS.lastPlan);
            storage.remove(KEYS.scenario);
          },
        },
        { label: t('cancel'), kind: 'secondary' },
      ],
    });

  const onVersionTap = () => {
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      useSettings.getState().unlockDebug();
      useToast.getState().show(t('debugUnlocked'));
      router.push('/debug');
    }
  };

  const modes: DataMode[] = liveOffered === 'yes' || dataMode === 'live' ? ['simulated', 'live'] : ['simulated'];

  const liveHint = modes.length === 1 && dataMode !== 'live' ? t(liveOffered === 'checking' ? 'modeChecking' : 'modeLiveUnavailable') : null;

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <StatusBarScrim />
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}
      >
        <View style={styles.headerBleed}>
          <ScreenHeader title={t('drawerSettings')} />
        </View>

        <AccountCard subtitle={signedIn ? accountEmail : t('accountRowSignedOut')} onPress={() => router.push('/account')} />

        {/* Trips: how you travel, and which data the app uses. */}
        <Section title={t('settingsTrips')} index={0} bare>
          <Card style={styles.group}>
            <View style={styles.field}>
              <AppText variant="label" tone="muted">
                {t('settingsTravel')}
              </AppText>
              <ChoiceGrid
                accessibilityLabel={t('settingsTravel')}
                value={profile}
                onChange={(p: Profile) => useSettings.getState().setProfile(p)}
                options={PROFILES.map((p) => ({ value: p, label: t(PROFILE_LABEL[p]), icon: PROFILE_ICON[p], testID: `settings-profile-${p}` }))}
              />
            </View>
            {profile === 'foot' ? (
              <>
                <View style={styles.rule} />
                <SwitchRow first icon={Lightbulb} label={t('preferLitLabel')} hint={t('preferLitHint')} value={preferLit} onChange={(v) => useSettings.getState().setPreferLit(v)} testID="prefer-lit" />
              </>
            ) : null}
            <View style={styles.rule} />
            <SwitchRow first icon={BellRing} label={t('commuteLabel')} hint={commute ? t('commuteSaved', { from: commute.originName, to: commute.destinationName, route: commute.usualName }) : t('commuteHint')} value={!!commute} onChange={(on) => (on ? saveCommute() : useCommute.getState().clear())} testID="watch-commute" />
            <View style={styles.rule} />
            <View style={styles.field}>
              <AppText variant="label" tone="muted">
                {t('settingsData')}
              </AppText>
              <Segmented
                accessibilityLabel={t('settingsMode')}
                value={dataMode}
                onChange={(m: DataMode) => chooseMode(m)}
                options={modes.map((m) => ({ value: m, label: t(m === 'live' ? 'modeLiveShort' : 'modeSimulatedShort'), icon: m === 'live' ? Radio : FlaskConical, testID: `mode-${m}` }))}
              />
              <AppText variant="meta" tone="muted">
                {t(dataMode === 'live' ? 'modeLiveHint' : 'modeSimulatedHint')}
              </AppText>
              <View style={styles.badgeRow}>{dataMode === 'live' ? <LiveBadge onShell={false} compact /> : <SimulatedBadge onShell={false} compact />}</View>
              {liveHint ? (
                <AppText variant="meta" tone="muted">
                  {liveHint}
                </AppText>
              ) : null}
            </View>
          </Card>
        </Section>

        {/* Display and voice: how the app looks, reads and speaks. */}
        <Section title={t('settingsDisplay')} index={1} bare>
          <Card style={styles.group}>
            <View style={styles.field}>
              <AppText variant="label" tone="muted">
                {t('settingsAppearance')}
              </AppText>
              <Segmented
                accessibilityLabel={t('settingsAppearance')}
                value={appearance}
                onChange={(a: Appearance) => useSettings.getState().setAppearance(a)}
                options={[
                  { value: 'system', label: t('appearanceSystem'), icon: Smartphone, testID: 'appearance-system' },
                  { value: 'light', label: t('appearanceLight'), icon: Sun, testID: 'appearance-light' },
                  { value: 'dark', label: t('appearanceDark'), icon: Moon, testID: 'appearance-dark' },
                ]}
              />
            </View>
            <View style={styles.rule} />
            <View style={styles.field}>
              <AppText variant="label" tone="muted">
                {t('settingsLanguage')}
              </AppText>
              <Segmented
                accessibilityLabel={t('settingsLanguage')}
                value={language}
                onChange={(l: Language) => useSettings.getState().setLanguage(l)}
                options={LANGUAGES.map((l) => ({ value: l, label: t(LANG_NATIVE[l]), testID: `language-${l}` }))}
              />
              <AppText variant="meta" tone="muted">
                {t('settingsLanguageHint')}
              </AppText>
            </View>
            <View style={styles.rule} />
            <SwitchRow first icon={TypeIcon} label={t('largerText')} hint={t('largerTextHint')} value={largerText} onChange={(v) => useSettings.getState().setLargerText(v)} testID="larger-text" />
            <SwitchRow icon={Volume2} label={t('speakChanges')} hint={t('speakChangesHint')} value={speakChanges} onChange={(v) => useSettings.getState().setSpeakChanges(v)} testID="speak-changes" />
            <SwitchRow icon={MapIcon} label={t('googleTraffic')} hint={t('googleTrafficHint')} value={googleTraffic} onChange={(v) => useSettings.getState().setGoogleTraffic(v)} testID="google-traffic" />
          </Card>
        </Section>

        {/* Advanced: the server address and the offline copy, folded away until needed. */}
        <Section title={t('settingsAdvanced')} index={2} bare>
          <Card style={styles.group}>
            <PressScale
              haptic="selection"
              scaleTo={0.985}
              onPress={() => setAdvancedOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: advancedOpen }}
              accessibilityLabel={t('settingsAdvanced')}
              accessibilityHint={t('settingsAdvancedHint')}
              style={styles.disclosure}
              testID="settings-advanced"
            >
              <View style={styles.flex}>
                <AppText variant="body" style={styles.disclosureTitle}>
                  {t('settingsAdvancedHint')}
                </AppText>
                <AppText variant="meta" tone="muted" numberOfLines={1}>
                  {apiUrl}
                </AppText>
              </View>
              <View style={advancedOpen ? styles.chevronOpen : undefined}>
                <ChevronDown size={20} color={tc.inkSubtle} />
              </View>
            </PressScale>
            {advancedOpen ? (
              <View>
                <View style={styles.rule} />
                <View style={styles.field}>
                  <AppText variant="label" tone="muted">
                    {t('settingsServer')}
                  </AppText>
                  <TextInput
                    value={draftUrl}
                    onChangeText={(v) => {
                      setDraftUrl(v);
                      setTestResult(null);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={t('serverPlaceholder')}
                    placeholderTextColor={tc.inkMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[styles.input, focused && styles.inputFocused]}
                    accessibilityLabel={t('settingsServer')}
                    onSubmitEditing={save}
                  />
                  <View style={styles.buttons}>
                    <Button label={t('serverSave')} onPress={save} style={styles.flex} />
                    <Button label={testing ? t('serverTesting') : t('serverTest')} kind="secondary" loading={testing} onPress={() => void test()} style={styles.flex} />
                  </View>
                  {testResult ? (
                    <View style={[styles.result, testResult.ok ? styles.resultOk : styles.resultBad]} accessibilityLiveRegion="polite">
                      {testResult.ok ? <CircleCheck size={16} color={tc.positiveInk} /> : <ServerOff size={16} color={tc.dangerInk} />}
                      <AppText variant="meta" tone={testResult.ok ? 'positive' : 'danger'} style={styles.flex}>
                        {testResult.text}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.rule} />
                <Row first icon={HardDrive} iconTone="neutral" title={cachedAtSimS !== null ? t('cachedAt', { clock: formatSimClock(clockStartsAt, cachedAtSimS) }) : t('cachedNone')} />
                <View style={styles.field}>
                  <Button label={t('clearCache')} kind="danger" onPress={clearCache} />
                </View>
              </View>
            ) : null}
          </Card>
        </Section>

        <Pressable onPress={onVersionTap} accessibilityRole="text" style={styles.version}>
          <AppText variant="label" tone="muted">
            {t('settingsVersion', { version: appVersion })}
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { gap: spacing.lg },
  // The header pads itself with the gutter: undo the content padding for it.
  headerBleed: { marginHorizontal: -GUTTER, marginBottom: -spacing.sm },
  flex: { flex: 1 },
  badgeRow: { flexDirection: 'row' },
  group: { padding: 0, overflow: 'hidden' },
  field: { padding: GUTTER, gap: spacing.sm },
  rule: { height: hairline, backgroundColor: tc.panelLine },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: GUTTER, minHeight: layout.minTouch + spacing.md },
  disclosureTitle: { fontFamily: fontFamily.medium, color: tc.ink },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sheet, borderWidth: hairline },
  accountTile: { width: layout.minTouch, height: layout.minTouch, borderRadius: radius.card, backgroundColor: tc.accent, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.xs },
  input: {
    ...text.mono,
    fontSize: text.body.fontSize,
    color: tc.ink,
    minHeight: layout.minTouch,
    borderWidth: 1,
    borderColor: tc.panelLine,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    backgroundColor: tc.panelSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputFocused: { borderColor: tc.focus, borderWidth: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card },
  resultOk: { backgroundColor: tc.positiveSoft },
  resultBad: { backgroundColor: tc.dangerSurface },
  version: { minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
}));
