import { DISPLAY_NAME_MAX, EmailSchema, OTP_LENGTH, isStaffRole } from '@vighnaway/contracts';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Info, TriangleAlert, WifiOff } from '@/components/icons';
import { GUTTER } from '@/components/ui';
import { t } from '@/i18n/en';
import { useLanguage } from '@/i18n/useLanguage';
import { api, ApiRequestError, retryAfterSeconds } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, layout, radius, spacing, text, useColors } from '@/theme';
import { minutesFor, requestNotice, verifyNotice, type Notice } from './signIn';

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

/**
 * Email, then the 6-digit code: the one sign-in form, used by the launch sign-in screen and by
 * Account. Staff accounts are refused here as well as on the server (the phone app is for citizens).
 * `padded` adds the card's inner padding (Account draws it inside a Section card).
 */
export function EmailOtpForm({ onSignedIn, padded = true }: { onSignedIn?: () => void; padded?: boolean }) {
  useLanguage();
  const tc = useColors();
  const styles = useStyles();
  const apiUrl = useSettings((s) => s.apiUrl);
  const offline = useConnection((s) => s.net === 'offline');

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [focus, setFocus] = useState<'email' | 'code' | 'name' | null>(null);
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
      onSignedIn?.();
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

  const input = (which: 'email' | 'name') => [styles.input, focus === which && styles.inputFocused];
  const canResend = wait.left === 0 && !busy && !offline;

  return (
    <View style={[styles.body, padded && styles.padded]}>
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
                <View key={i} style={[styles.digit, focus === 'code' && i === Math.min(code.length, OTP_LENGTH - 1) && styles.digitActive, i < code.length && styles.digitFilled]}>
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
              <AppText variant="label" style={[styles.linkText, { color: tc.accentInk }]}>
                {wait.left > 0 ? t('accountResendIn', { seconds: wait.left }) : t('accountResend')}
              </AppText>
            </Pressable>
            <AppText variant="meta" tone="muted">
              ·
            </AppText>
            <Pressable onPress={changeEmail} hitSlop={spacing.xs} accessibilityRole="button" accessibilityLabel={t('accountChangeEmail')} style={styles.link} testID="account-change-email">
              <AppText variant="label" style={[styles.linkText, { color: tc.accentInk }]}>
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
  );
}

const useStyles = createStyles((tc) => ({
  body: { gap: spacing.md },
  padded: { padding: GUTTER + spacing.xxs },
  flex: { flex: 1 },
  field: { gap: spacing.xxs },
  codeRow: { flexDirection: 'row', gap: spacing.xs },
  digit: { flex: 1, height: layout.minTouch + spacing.sm, borderRadius: radius.button, borderWidth: 1.5, borderColor: tc.inkMuted, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  digitFilled: { borderColor: tc.accentInk },
  digitActive: { borderColor: tc.accentInk, borderWidth: 2 },
  digitText: { ...text.mono, fontSize: 24, lineHeight: 30, color: tc.ink },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm },
  link: { minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: spacing.xs },
  linkOff: { opacity: 0.5 },
  linkText: { textDecorationLine: 'underline' },
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
