import { formatSimClock, PROFILES, type Profile } from '@vighnaway/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { Bike, Car, CircleCheck, Footprints, MapIcon, Moon, ServerOff, Smartphone, Sun, TypeIcon, Volume2, type LucideIcon } from '@/components/icons';
import { LiveBadge, SimulatedBadge } from '@/components/EvidenceChips';
import { enterUp, PressScale } from '@/components/motion';
import { switchDataMode } from '@/features/live/mode';
import { Segmented } from '@/components/Segmented';
import { appVersion } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { LANGUAGES, type Language } from '@/i18n/lang';
import { api } from '@/lib/api';
import { useReduceMotion } from '@/lib/motion';
import { KEYS, storage } from '@/lib/storage';
import { useActivity } from '@/stores/activity';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings, type Appearance, type DataMode } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, fontFamily, hairline, layout, radius, spacing, text, useColors } from '@/theme';

const PROFILE_LABEL = { car: 'profileCar', two_wheeler: 'profileTwoWheeler', foot: 'profileFoot' } as const;
const PROFILE_ICON = { car: Car, two_wheeler: Bike, foot: Footprints } as const;

function Section({ title, children, index, bare }: { title: string; children: React.ReactNode; index: number; bare?: boolean }) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterUp(index, reduce)} style={styles.section}>
      <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </AppText>
      {bare ? children : <View style={styles.group}>{children}</View>}
    </Animated.View>
  );
}

/** One data-mode option: radio, name, badge and what it means. */
function ModeRow({ mode, selected, onPress }: { mode: DataMode; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  const live = mode === 'live';
  return (
    <PressScale
      haptic="selection"
      scaleTo={0.985}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t(live ? 'modeLive' : 'modeSimulated')}
      testID={`mode-${mode}`}
      style={[styles.modeRow, selected && styles.modeRowSelected]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.flex}>
        <View style={styles.modeHead}>
          <AppText style={styles.strong}>{t(live ? 'modeLive' : 'modeSimulated')}</AppText>
          {live ? <LiveBadge onShell={false} compact /> : <SimulatedBadge onShell={false} compact />}
        </View>
        <AppText variant="meta" tone="muted">
          {t(live ? 'modeLiveHint' : 'modeSimulatedHint')}
        </AppText>
      </View>
    </PressScale>
  );
}

const LANG_NATIVE: Record<Language, StringKey> = { en: 'langEn', hi: 'langHi', mr: 'langMr' };
const LANG_ENGLISH: Record<Language, StringKey> = { en: 'languageEnglish', hi: 'languageHindi', mr: 'languageMarathi' };

/** A labelled switch with its explanation underneath. */
function SwitchRow({ icon: Icon, label, hint, value, onChange, testID }: { icon: LucideIcon; label: string; hint: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={styles.switchBlock}>
      <View style={styles.switchRow}>
        <Icon size={18} color={tc.ink} />
        <AppText style={styles.flex}>{label}</AppText>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          accessibilityHint={hint}
          trackColor={{ true: tc.accent, false: tc.controlBorder }}
          thumbColor={tc.white}
          testID={testID}
        />
      </View>
      <AppText variant="meta" tone="muted">
        {hint}
      </AppText>
    </View>
  );
}

export default function SettingsScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const dataMode = useSettings((s) => s.dataMode);
  const appearance = useSettings((s) => s.appearance);
  const googleTraffic = useSettings((s) => s.googleTraffic);
  const language = useSettings((s) => s.language);
  const largerText = useSettings((s) => s.largerText);
  const speakChanges = useSettings((s) => s.speakChanges);
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

  const chooseMode = (mode: DataMode) => {
    if (mode === dataMode) return;
    Alert.alert(t('switchModeTitle'), t(mode === 'live' ? 'switchModeToLive' : 'switchModeToSimulated'), [
      { text: t('switchServerCancel'), style: 'cancel' },
      { text: t('switchServerConfirm'), onPress: () => switchDataMode(mode) },
    ]);
  };

  const validUrl = (u: string) => /^https?:\/\/[^\s/]+/i.test(u.trim());

  const save = () => {
    const url = draftUrl.trim().replace(/\/+$/, '');
    if (!validUrl(url)) {
      setTestResult({ ok: false, text: t('serverInvalid') });
      return;
    }
    if (url === apiUrl) return;
    Alert.alert(t('switchServerTitle'), t('switchServerBody', { url }), [
      { text: t('switchServerCancel'), style: 'cancel' },
      { text: t('switchServerConfirm'), onPress: () => useSettings.getState().setApiUrl(url) },
    ]);
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
    Alert.alert(t('clearCacheTitle'), t('clearCacheBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clearCacheConfirm'),
        style: 'destructive',
        onPress: () => {
          useIncidents.getState().clearCache();
          useActivity.getState().clear();
          storage.remove(KEYS.lastPlan);
          storage.remove(KEYS.scenario);
        },
      },
    ]);

  const onVersionTap = () => {
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      useSettings.getState().unlockDebug();
      useToast.getState().show(t('debugUnlocked'));
      router.push('/debug');
    }
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.root}>
      <ThemedStatusBar />
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <Section title={t('settingsProfile')} index={0} bare>
          <Segmented
            accessibilityLabel={t('settingsProfile')}
            value={profile}
            onChange={(p: Profile) => useSettings.getState().setProfile(p)}
            options={PROFILES.map((p) => ({ value: p, label: t(PROFILE_LABEL[p]), icon: PROFILE_ICON[p] }))}
          />
        </Section>
        <Section title={t('settingsAppearance')} index={1} bare>
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
          <AppText variant="meta" tone="muted" style={styles.modeNote}>
            {t('appearanceHint')}
          </AppText>
        </Section>
        <Section title={t('settingsMode')} index={1}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('settingsMode')} style={styles.modes}>
            <ModeRow mode="simulated" selected={dataMode === 'simulated'} onPress={() => chooseMode('simulated')} />
            {liveOffered === 'yes' || dataMode === 'live' ? (
              <ModeRow mode="live" selected={dataMode === 'live'} onPress={() => chooseMode('live')} />
            ) : (
              <AppText variant="meta" tone="muted" style={styles.modeNote}>
                {t(liveOffered === 'checking' ? 'modeChecking' : 'modeLiveUnavailable')}
              </AppText>
            )}
          </View>
        </Section>
        <Section title={t('settingsLanguage')} index={2}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('settingsLanguage')}>
            {LANGUAGES.map((l, i) => {
              const selected = language === l;
              return (
                <PressScale
                  key={l}
                  haptic="selection"
                  scaleTo={0.985}
                  onPress={() => !selected && useSettings.getState().setLanguage(l)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(LANG_NATIVE[l]) === t(LANG_ENGLISH[l]) ? t(LANG_NATIVE[l]) : `${t(LANG_NATIVE[l])}, ${t(LANG_ENGLISH[l])}`}
                  testID={`language-${l}`}
                  style={[styles.langRow, i > 0 && styles.divider]}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <AppText style={[styles.flex, selected && styles.strong]}>{t(LANG_NATIVE[l])}</AppText>
                  {/* The name in the current UI language, when it differs from the language's own name. */}
                  {t(LANG_NATIVE[l]) !== t(LANG_ENGLISH[l]) ? (
                    <AppText variant="meta" tone="muted">
                      {t(LANG_ENGLISH[l])}
                    </AppText>
                  ) : null}
                </PressScale>
              );
            })}
          </View>
          <AppText variant="meta" tone="muted">
            {t('settingsLanguageHint')}
          </AppText>
        </Section>
        <Section title={t('settingsAccessibility')} index={3}>
          <SwitchRow
            icon={TypeIcon}
            label={t('largerText')}
            hint={t('largerTextHint')}
            value={largerText}
            onChange={(v) => useSettings.getState().setLargerText(v)}
            testID="larger-text"
          />
          <View style={styles.rule} />
          <SwitchRow
            icon={Volume2}
            label={t('speakChanges')}
            hint={t('speakChangesHint')}
            value={speakChanges}
            onChange={(v) => useSettings.getState().setSpeakChanges(v)}
            testID="speak-changes"
          />
        </Section>
        <Section title={t('settingsMap')} index={4}>
          <SwitchRow
            icon={MapIcon}
            label={t('googleTraffic')}
            hint={t('googleTrafficHint')}
            value={googleTraffic}
            onChange={(v) => useSettings.getState().setGoogleTraffic(v)}
          />
        </Section>
        <Section title={t('settingsServer')} index={5}>
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
          <View style={styles.row}>
            <Button label={t('serverSave')} onPress={save} style={styles.save} />
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
        </Section>
        <Section title={t('settingsOffline')} index={6}>
          <AppText>{cachedAtSimS !== null ? t('cachedAt', { clock: formatSimClock(clockStartsAt, cachedAtSimS) }) : t('cachedNone')}</AppText>
          <Button label={t('clearCache')} kind="danger" onPress={clearCache} />
        </Section>
        <Pressable onPress={onVersionTap} accessibilityRole="text" style={styles.version}>
          <AppText variant="label" tone="muted">
            {t('settingsVersion', { version: appVersion })}
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { padding: spacing.md, gap: spacing.lg },
  section: { gap: spacing.xs },
  sectionTitle: { paddingHorizontal: spacing.xxs },
  // Sections are grouped by a rule and spacing, not wrapped in cards (DESIGN_VISION 3.3).
  group: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: hairline, borderTopColor: tc.shellHairlineStrong },
  rule: { height: hairline, backgroundColor: tc.panelHairline },
  row: { flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
  save: { paddingHorizontal: spacing.lg },
  dim: { color: tc.inkMuted },
  langRow: { flexDirection: 'row', alignItems: 'center', minHeight: layout.minTouch, gap: spacing.sm },
  divider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  input: {
    ...text.mono,
    fontSize: text.body.fontSize,
    color: tc.ink,
    minHeight: layout.minTouch,
    borderWidth: 1,
    borderColor: tc.controlBorder,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    backgroundColor: tc.panel,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputFocused: { borderColor: tc.focus, borderWidth: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.button },
  resultOk: { backgroundColor: tc.positiveSoft },
  resultBad: { backgroundColor: tc.dangerSurface },
  version: { minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  strong: { fontFamily: fontFamily.semibold },
  modes: { gap: spacing.xs },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: tc.panelLine,
  },
  modeRowSelected: { borderColor: tc.ink, borderWidth: 1.5, backgroundColor: tc.panel },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginBottom: 2 },
  modeNote: { paddingHorizontal: spacing.xxs },
  radio: { width: spacing.md + 2, height: spacing.md + 2, borderRadius: radius.chip, borderWidth: 2, borderColor: tc.controlBorder, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: tc.ink },
  radioDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.ink },
  switchBlock: { gap: spacing.xxs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.minTouch },
}));
