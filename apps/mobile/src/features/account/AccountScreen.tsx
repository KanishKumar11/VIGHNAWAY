import { DISPLAY_NAME_MAX, EmailSchema, OTP_LENGTH, isStaffRole, type MyStatsResponse } from '@vighnaway/contracts';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CircleCheck, Info, LogOut, Pencil, Trash, TriangleAlert, WifiOff } from '@/components/icons';
import { GUTTER, Row, ScreenHeader, Section, StatusBarScrim } from '@/components/ui';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { t } from '@/i18n/en';
import { api, ApiRequestError, retryAfterSeconds } from '@/lib/api';
import { selectSignedIn, useAuth } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { showDialog } from '@/stores/dialog';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, fontFamily, glow, hairline, layout, radius, shadow, spacing, text, useBrand, useColors } from '@/theme';
import { MyReports } from './MyReports';
import { minutesFor, requestNotice, statsLines, verifyNotice, type Notice } from './signIn';
import { useLanguage } from '@/i18n/useLanguage';

/** Counts down from a number of seconds; `left` is 0 when nothing is pending. */
function useCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  const start = useCallback((seconds: number) => {
    const n = Date.now();
    setNow(n);
    setUntil(n + seconds * 1000);
  }, []);
  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start };
}

type Stats = { state: 'loading' } | { state: 'error' } | { state: 'offline' } | { state: 'ok'; data: MyStatsResponse };

/**
 * Optional account. Signed out: email, then the 6-digit code. Signed in: who you are, a quiet
 * thank-you count and Sign out. Signing in is never needed to navigate or report, and nothing here
 * is a score: routes read incidents only.
 */
export function AccountScreen() {
  useLanguage();
  const tc = useColors();
  const brand = useBrand();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const apiUrl = useSettings((s) => s.apiUrl);
  const offline = useConnection((s) => s.net === 'offline');
  const signedIn = useAuth(selectSignedIn);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [focus, setFocus] = useState<'email' | 'code' | 'name' | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const wait = useCountdown();
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus?.();
  }, [step]);

  const sendCode = async () => {
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setNotice({ text: t('accountEmailInvalid'), tone: 'danger' });
      return;
    }
    setBusy('send');
    setNotice(null);
    try {
      const r = await api.authOtpRequest(apiUrl, { email: parsed.data, client: 'mobile' });
      wait.start(r.resendAfterS);
      setEmail(parsed.data);
      setCode('');
      setInfo(t('accountCodeSent', { email: parsed.data, minutes: minutesFor(r.expiresInS) }));
      setStep('code');
    } catch (e) {
      const retry = retryAfterSeconds(e);
      if (e instanceof ApiRequestError && e.status === 429 && retry) {
        // A code went out a moment ago: show the code step and count down to the next one.
        wait.start(retry);
        if (step === 'email') {
          setEmail(parsed.data);
          setInfo(t('accountCodeSentRecent', { email: parsed.data, seconds: retry }));
          setStep('code');
        } else {
          setNotice({ text: t('accountRateWait', { seconds: retry }), tone: 'warn' });
        }
      } else {
        setNotice(requestNotice(e, apiUrl));
      }
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setNotice({ text: t('accountCodeFormat'), tone: 'danger' });
      return;
    }
    setBusy('verify');
    setNotice(null);
    try {
      const trimmed = name.trim();
      const session = await api.authOtpVerify(apiUrl, { email, code, client: 'mobile', ...(trimmed ? { displayName: trimmed } : null) });
      if (isStaffRole(session.user.role)) {
        // The server refuses this already; never keep a staff session on a citizen phone.
        setNotice({ text: t('accountStaff'), tone: 'warn' });
        return;
      }
      useAuth.getState().setSession(session);
      useToast.getState().show(t('accountSignedInToast'), 'positive');
      setStep('email');
      setCode('');
      setName('');
      setInfo(null);
    } catch (e) {
      setNotice(verifyNotice(e, apiUrl));
      setCode('');
      codeRef.current?.focus?.();
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setInfo(null);
    setNotice(null);
  };

  const confirmSignOut = () =>
    showDialog({
      title: t('accountSignOutTitle'),
      message: t('accountSignOutBody'),
      icon: LogOut,
      tone: 'danger',
      actions: [
        {
          label: t('accountSignOut'),
          kind: 'danger',
          onPress: () => {
            void useAuth.getState().signOut();
            useToast.getState().show(t('accountSignedOutToast'));
          },
        },
        { label: t('cancel'), kind: 'secondary' },
      ],
    });

  const startEdit = () => {
    setNameDraft(user?.displayName ?? '');
    setEditing(true);
  };

  /** An empty box removes the name. The server returns the stored (plain text) name, which is what is kept. */
  const saveName = async () => {
    if (!token) return;
    setSavingName(true);
    try {
      const next = nameDraft.trim();
      const r = await api.updateMe(apiUrl, token, next.length ? next : null);
      useAuth.getState().setUser(r.user);
      setEditing(false);
      useToast.getState().show(t('accountNameSaved'), 'positive');
    } catch {
      useToast.getState().show(t('accountNameError'), 'warn');
    } finally {
      setSavingName(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(t('accountDeleteTitle'), t('accountDeleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('accountDeleteConfirm'),
        style: 'destructive',
        onPress: () => {
          if (!token) return;
          setDeleting(true);
          api
            .deleteMe(apiUrl, token)
            .then(() => {
              useAuth.getState().clearLocal();
              useToast.getState().show(t('accountDeletedToast'));
            })
            .catch(() => useToast.getState().show(t('accountDeleteError'), 'warn'))
            .finally(() => setDeleting(false));
        },
      },
    ]);

  // The thank-you count: loading, offline and error each have a line of their own.
  const [stats, setStats] = useState<Stats>({ state: 'loading' });
  useEffect(() => {
    if (!signedIn || !token) return;
    if (offline) {
      setStats({ state: 'offline' });
      return;
    }
    let alive = true;
    setStats({ state: 'loading' });
    api
      .myStats(apiUrl, token)
      .then((data) => alive && setStats({ state: 'ok', data }))
      .catch((e) => {
        if (!alive) return;
        setStats({ state: 'error' });
        // A 401 means the session is gone: revalidate, which signs this phone out.
        if (e instanceof ApiRequestError && e.status === 401) void useAuth.getState().hydrate();
      });
    return () => {
      alive = false;
    };
  }, [signedIn, token, offline, apiUrl]);

  const input = (which: 'email' | 'code' | 'name') => [styles.input, focus === which && styles.inputFocused];
  const canResend = wait.left === 0 && !busy && !offline;

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
          <ScreenHeader title={t('drawerAccount')} subtitle={signedIn ? null : t('accountSubtitle')} />
        </View>

        {signedIn && user ? (
          <>
            <Section index={0} bare>
              <View
                style={[styles.who, { backgroundColor: brand.hero, borderColor: brand.heroEdge }, shadow('md')]}
                accessible
                accessibilityLabel={`${t('accountSignedInAs')}: ${user.displayName ? `${user.displayName}, ${user.email}` : user.email}`}
                testID="account-user"
              >
                <View style={[styles.avatar, glow(tc.accent, 0.5)]} importantForAccessibility="no-hide-descendants">
                  <AppText style={styles.avatarLetter}>{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="title" style={{ color: brand.onHero }} numberOfLines={1}>
                    {user.displayName ?? user.email}
                  </AppText>
                  <AppText variant="meta" style={{ color: brand.onHeroMuted }} numberOfLines={1}>
                    {user.displayName ? user.email : t('accountSignedInAs')}
                  </AppText>
                </View>
              </View>
            </Section>
            <Section title={t('accountNameRow')} index={1}>
              {editing ? (
                <View style={styles.cardBody}>
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    onFocus={() => setFocus('name')}
                    onBlur={() => setFocus(null)}
                    maxLength={DISPLAY_NAME_MAX}
                    autoComplete="name"
                    textContentType="name"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => void saveName()}
                    style={input('name')}
                    accessibilityLabel={t('accountNameLabel')}
                    testID="account-name-edit"
                  />
                  <View style={styles.buttons}>
                    <Button label={t('accountSave')} onPress={() => void saveName()} loading={savingName} disabled={offline} style={styles.flex} testID="account-name-save" />
                    <Button label={t('cancel')} kind="ghost" onPress={() => setEditing(false)} style={styles.flex} testID="account-name-cancel" />
                  </View>
                </View>
              ) : (
                <Row
                  first
                  icon={Pencil}
                  title={user.displayName ?? t('accountNameNone')}
                  trailing={<Button label={t('accountEdit')} kind="ghost" onPress={startEdit} testID="account-name-open" />}
                />
              )}
            </Section>
            <Section title={t('accountStatsTitle')} index={2} hint={t('accountPrivacyNote')}>
              <View accessibilityLiveRegion="polite" testID="account-stats">
                {stats.state === 'loading' ? (
                  <Row first icon={CircleCheck} iconTone="neutral" title={t('accountStatsLoading')} trailing={<ActivityIndicator color={tc.inkMuted} />} />
                ) : stats.state === 'offline' ? (
                  <Row first icon={WifiOff} iconTone="neutral" title={t('accountStatsOffline')} />
                ) : stats.state === 'error' ? (
                  <Row first icon={TriangleAlert} iconTone="warn" title={t('accountStatsError')} />
                ) : (
                  statsLines(stats.data).map((line, i) => <Row key={line} first={i === 0} icon={CircleCheck} iconTone="positive" title={line} />)
                )}
              </View>
            </Section>
            <MyReports />
            <Section bare index={3}>
              <Button label={t('accountSignOut')} kind="secondary" icon={LogOut} onPress={confirmSignOut} testID="account-signout" />
              <Button label={t('accountDelete')} kind="danger" icon={Trash} onPress={confirmDelete} loading={deleting} disabled={offline} testID="account-delete" />
            </Section>
          </>
        ) : (
          <Section title={t('accountSignedOutTitle')} index={0} hint={t('accountSignedOutBody')}>
            <View style={styles.cardBody}>
              {offline ? (
                <View style={[styles.notice, styles.noticeWarn]} accessibilityLiveRegion="polite" testID="account-offline">
                  <WifiOff size={16} color={tc.warnInk} />
                  <AppText variant="meta" tone="warn" style={styles.flex}>
                    {t('accountOffline')}
                  </AppText>
                </View>
              ) : null}

              <AppText variant="label" tone="muted" testID="account-step">
                {t('accountStep', { n: step === 'email' ? 1 : 2 })}
              </AppText>
              {step === 'email' ? (
                <>
                  <View style={styles.field}>
                    <AppText variant="label" tone="muted">
                      {t('accountEmailLabel')}
                    </AppText>
                    <TextInput
                      value={email}
                      onChangeText={(v) => {
                        setEmail(v);
                        setNotice(null);
                      }}
                      onFocus={() => setFocus('email')}
                      onBlur={() => setFocus(null)}
                      placeholder={t('accountEmailPlaceholder')}
                      placeholderTextColor={tc.inkMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      returnKeyType="send"
                      onSubmitEditing={() => void sendCode()}
                      style={input('email')}
                      accessibilityLabel={t('accountEmailLabel')}
                      testID="account-email"
                    />
                  </View>
                  <View style={styles.field}>
                    <AppText variant="label" tone="muted">
                      {t('accountNameLabel')}
                    </AppText>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      onFocus={() => setFocus('name')}
                      onBlur={() => setFocus(null)}
                      maxLength={DISPLAY_NAME_MAX}
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="done"
                      style={input('name')}
                      accessibilityLabel={t('accountNameLabel')}
                      accessibilityHint={t('accountNameHint')}
                      testID="account-name"
                    />
                    <AppText variant="meta" tone="muted">
                      {t('accountNameHint')}
                    </AppText>
                  </View>
                  <Button
                    label={busy === 'send' ? t('accountSending') : wait.left > 0 ? t('accountTryAgainIn', { seconds: wait.left }) : t('accountSendCode')}
                    onPress={() => void sendCode()}
                    loading={busy === 'send'}
                    disabled={offline || wait.left > 0 || email.trim().length === 0}
                    testID="account-send"
                  />
                </>
              ) : (
                <>
                  {info ? (
                    <AppText variant="meta" tone="muted" accessibilityLiveRegion="polite" testID="account-info">
                      {info}
                    </AppText>
                  ) : null}
                  <View style={styles.field}>
                    <AppText variant="label" tone="muted">
                      {t('accountCodeLabel')}
                    </AppText>
                    <View style={styles.codeRow}>
                      {Array.from({ length: OTP_LENGTH }, (_, i) => (
                        <View
                          key={i}
                          style={[styles.digit, focus === 'code' && i === Math.min(code.length, OTP_LENGTH - 1) && styles.digitActive, i < code.length && styles.digitFilled]}
                        >
                          <AppText style={styles.digitText}>{code[i] ?? ''}</AppText>
                        </View>
                      ))}
                    <TextInput
                      ref={codeRef}
                      value={code}
                      onChangeText={(v) => {
                        setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH));
                        setNotice(null);
                      }}
                      onFocus={() => setFocus('code')}
                      onBlur={() => setFocus(null)}
                      caretHidden
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={OTP_LENGTH}
                      textContentType="oneTimeCode"
                      autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => void verify()}
                      style={styles.codeInput}
                      accessibilityLabel={t('accountCodeLabel')}
                      testID="account-code"
                    />
                    </View>
                  </View>
                  <Button
                    label={busy === 'verify' ? t('accountVerifying') : t('accountVerify')}
                    onPress={() => void verify()}
                    loading={busy === 'verify'}
                    disabled={offline || code.length !== OTP_LENGTH}
                    testID="account-verify"
                  />
                  <View style={styles.links}>
                    <Pressable
                      onPress={() => void sendCode()}
                      disabled={!canResend}
                      hitSlop={spacing.xs}
                      accessibilityRole="button"
                      accessibilityLabel={wait.left > 0 ? t('accountResendIn', { seconds: wait.left }) : t('accountResend')}
                      accessibilityState={{ disabled: !canResend }}
                      style={[styles.link, !canResend && styles.linkOff]}
                      testID="account-resend"
                    >
                      <AppText variant="label" style={{ color: tc.accentInk, textDecorationLine: 'underline' }}>
                        {wait.left > 0 ? t('accountResendIn', { seconds: wait.left }) : t('accountResend')}
                      </AppText>
                    </Pressable>
                    <AppText variant="meta" tone="muted">
                      ·
                    </AppText>
                    <Pressable
                      onPress={changeEmail}
                      hitSlop={spacing.xs}
                      accessibilityRole="button"
                      accessibilityLabel={t('accountChangeEmail')}
                      style={styles.link}
                      testID="account-change-email"
                    >
                      <AppText variant="label" style={{ color: tc.accentInk, textDecorationLine: 'underline' }}>
                        {t('accountChangeEmail')}
                      </AppText>
                    </Pressable>
                  </View>
                </>
              )}

              {notice ? (
                <View style={[styles.notice, notice.tone === 'warn' ? styles.noticeWarn : styles.noticeBad]} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="account-notice">
                  {notice.tone === 'warn' ? <Info size={16} color={tc.warnInk} /> : <TriangleAlert size={16} color={tc.dangerInk} />}
                  <AppText variant="meta" tone={notice.tone === 'warn' ? 'warn' : 'danger'} style={styles.flex}>
                    {notice.text}
                  </AppText>
                </View>
              ) : null}
            </View>
          </Section>
        )}
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
  cardBody: { padding: GUTTER + spacing.xxs, gap: spacing.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sheet, borderWidth: hairline },
  avatar: { width: layout.minTouch + spacing.xs, height: layout.minTouch + spacing.xs, borderRadius: radius.chip, backgroundColor: tc.accent, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 28, color: tc.onAccent },
  field: { gap: spacing.xxs },
  buttons: { flexDirection: 'row', gap: spacing.xs },
  codeRow: { flexDirection: 'row', gap: spacing.xs },
  digit: { flex: 1, height: layout.minTouch + spacing.sm, borderRadius: radius.button, borderWidth: 1.5, borderColor: tc.inkMuted, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  digitFilled: { borderColor: tc.accentInk },
  digitActive: { borderColor: tc.accentInk, borderWidth: 2 },
  digitText: { ...text.mono, fontSize: 24, lineHeight: 30, color: tc.ink },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm },
  link: { minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.xs },
  linkOff: { opacity: 0.5 },
  input: {
    ...text.body,
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
  codeInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card },
  noticeWarn: { backgroundColor: tc.warnSurface },
  noticeBad: { backgroundColor: tc.dangerSurface },
}));
