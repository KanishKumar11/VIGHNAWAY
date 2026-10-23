import { DISPLAY_NAME_MAX, type MyStatsResponse } from '@vighnaway/contracts';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CircleCheck, LogOut, Pencil, Trash, TriangleAlert, WifiOff } from '@/components/icons';
import { GUTTER, Row, ScreenHeader, Section, StatusBarScrim } from '@/components/ui';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { t } from '@/i18n/en';
import { api, ApiRequestError } from '@/lib/api';
import { selectSignedIn, useAuth } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { showDialog } from '@/stores/dialog';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { createStyles, fontFamily, glow, hairline, layout, radius, shadow, spacing, text, useBrand, useColors } from '@/theme';
import { MyReports } from './MyReports';
import { EmailOtpForm } from './EmailOtpForm';
import { statsLines } from './signIn';
import { useLanguage } from '@/i18n/useLanguage';

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

  const [focus, setFocus] = useState<'name' | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
              useSettings.getState().setSignInSkipped(false);
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

  const input = (which: 'name') => [styles.input, focus === which && styles.inputFocused];

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
            <EmailOtpForm />
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
  buttons: { flexDirection: 'row', gap: spacing.xs },
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
}));
