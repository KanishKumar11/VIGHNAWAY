import { formatSimClock, PROFILES, type Profile } from '@vighnaway/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { Bike, Car, CircleCheck, FlaskConical, Footprints, HardDrive, Languages, MapIcon, Moon, Radio, ServerOff, Smartphone, Sun, TypeIcon, Volume2, type LucideIcon } from '@/components/icons';
import { LiveBadge, SimulatedBadge } from '@/components/EvidenceChips';
import { GUTTER, Radio as RadioMark, Row, ScreenHeader, Section } from '@/components/ui';
import { switchDataMode } from '@/features/live/mode';
import { Segmented } from '@/components/Segmented';
import { appVersion } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { LANGUAGES, type Language } from '@/i18n/lang';
import { api } from '@/lib/api';
import { KEYS, storage } from '@/lib/storage';
import { useActivity } from '@/stores/activity';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings, type Appearance, type DataMode } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, layout, radius, spacing, text, useColors } from '@/theme';

const PROFILE_LABEL = { car: 'profileCar', two_wheeler: 'profileTwoWheeler', foot: 'profileFoot' } as const;
const PROFILE_ICON = { car: Car, two_wheeler: Bike, foot: Footprints } as const;

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

  const modes: DataMode[] = liveOffered === 'yes' || dataMode === 'live' ? ['simulated', 'live'] : ['simulated'];

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}
      >
        <View style={styles.headerBleed}>
          <ScreenHeader title={t('drawerSettings')} />
        </View>
        <Section title={t('settingsProfile')} index={0} bare>
          <Segmented
            accessibilityLabel={t('settingsProfile')}
            value={profile}
            onChange={(p: Profile) => useSettings.getState().setProfile(p)}
            options={PROFILES.map((p) => ({ value: p, label: t(PROFILE_LABEL[p]), icon: PROFILE_ICON[p] }))}
          />
        </Section>
        <Section title={t('settingsAppearance')} index={1} bare hint={t('appearanceHint')}>
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
        </Section>
        <Section
          title={t('settingsMode')}
          index={2}
          hint={modes.length === 1 && dataMode !== 'live' ? t(liveOffered === 'checking' ? 'modeChecking' : 'modeLiveUnavailable') : null}
        >
          <View accessibilityRole="radiogroup" accessibilityLabel={t('settingsMode')}>
            {modes.map((m, i) => {
              const selected = dataMode === m;
              const live = m === 'live';
              return (
                <Row
                  key={m}
                  first={i === 0}
                  icon={live ? Radio : FlaskConical}
                  iconTone={selected ? 'accent' : 'neutral'}
                  title={t(live ? 'modeLive' : 'modeSimulated')}
                  subtitle={t(live ? 'modeLiveHint' : 'modeSimulatedHint')}
                  selected={selected}
                  onPress={() => chooseMode(m)}
                  accessibilityRole="radio"
                  accessibilityLabel={t(live ? 'modeLive' : 'modeSimulated')}
                  testID={`mode-${m}`}
                  trailing={<RadioMark on={selected} />}
                >
                  <View style={styles.badgeRow}>{live ? <LiveBadge onShell={false} compact /> : <SimulatedBadge onShell={false} compact />}</View>
                </Row>
              );
            })}
          </View>
        </Section>
        <Section title={t('settingsLanguage')} index={3} hint={t('settingsLanguageHint')}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('settingsLanguage')}>
            {LANGUAGES.map((l, i) => {
              const selected = language === l;
              const native = t(LANG_NATIVE[l]);
              const english = t(LANG_ENGLISH[l]);
              return (
                <Row
                  key={l}
                  first={i === 0}
                  icon={Languages}
                  iconTone={selected ? 'accent' : 'neutral'}
                  title={native}
                  subtitle={native !== english ? english : null}
                  selected={selected}
                  onPress={() => !selected && useSettings.getState().setLanguage(l)}
                  accessibilityRole="radio"
                  accessibilityLabel={native === english ? native : `${native}, ${english}`}
                  testID={`language-${l}`}
                  trailing={<RadioMark on={selected} />}
                />
              );
            })}
          </View>
        </Section>
        <Section title={t('settingsAccessibility')} index={4}>
          <SwitchRow first icon={TypeIcon} label={t('largerText')} hint={t('largerTextHint')} value={largerText} onChange={(v) => useSettings.getState().setLargerText(v)} testID="larger-text" />
          <SwitchRow icon={Volume2} label={t('speakChanges')} hint={t('speakChangesHint')} value={speakChanges} onChange={(v) => useSettings.getState().setSpeakChanges(v)} testID="speak-changes" />
        </Section>
        <Section title={t('settingsMap')} index={5}>
          <SwitchRow first icon={MapIcon} label={t('googleTraffic')} hint={t('googleTrafficHint')} value={googleTraffic} onChange={(v) => useSettings.getState().setGoogleTraffic(v)} />
        </Section>
        <Section title={t('settingsServer')} index={6}>
          <View style={styles.cardBody}>
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
        </Section>
        <Section title={t('settingsOffline')} index={7}>
          <Row first icon={HardDrive} iconTone="neutral" title={cachedAtSimS !== null ? t('cachedAt', { clock: formatSimClock(clockStartsAt, cachedAtSimS) }) : t('cachedNone')} />
          <View style={styles.cardBody}>
            <Button label={t('clearCache')} kind="danger" onPress={clearCache} />
          </View>
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
  badgeRow: { flexDirection: 'row', marginTop: spacing.xxs },
  cardBody: { padding: GUTTER, gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.xs },
  input: {
    ...text.mono,
    fontSize: text.body.fontSize,
    color: tc.ink,
    minHeight: layout.minTouch,
    borderWidth: 1,
    borderColor: tc.panelLine,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    backgroundColor: tc.panelSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputFocused: { borderColor: tc.focus, borderWidth: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card },
  resultOk: { backgroundColor: tc.positiveSoft },
  resultBad: { backgroundColor: tc.dangerSurface },
  version: { minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
}));
