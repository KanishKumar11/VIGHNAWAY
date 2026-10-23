import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Mark } from '@/components/Mark';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Card, GUTTER, StatusBarScrim } from '@/components/ui';
import { EmailOtpForm } from '@/features/account/EmailOtpForm';
import { t } from '@/i18n/en';
import { useLanguage } from '@/i18n/useLanguage';
import { selectSignedIn, useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';
import { createStyles, fontFamily, hairline, letterSpacing, radius, shadow, spacing, text, useBrand } from '@/theme';

/**
 * The launch sign-in screen (email, then a 6-digit code). It follows the first run while the phone
 * has no account, and comes back after signing out. Signing in stays optional (CONTRACTS.md: an
 * account is never needed to navigate or report), so "Continue without an account" is always there
 * and is remembered.
 */
export default function SignIn() {
  useLanguage();
  const styles = useStyles();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  const signedIn = useAuth(selectSignedIn);

  if (signedIn) return <Redirect href="/" />;

  const skip = () => {
    useSettings.getState().setSignInSkipped(true);
    router.replace('/');
  };

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <KeyboardAwareScrollView
        bottomOffset={spacing.lg}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER },
        ]}
      >
        {/* Brand hero: the same deep surface as the drawer, so the first screen after the story is recognisably the app. */}
        <View style={[styles.hero, { backgroundColor: brand.hero, borderColor: brand.heroEdge }, shadow('lg')]}>
          <View style={styles.markTile}>
            <Mark size={32} />
          </View>
          <View style={styles.flex}>
            <AppText style={[styles.wordmark, { color: brand.onHero }]}>{t('appName')}</AppText>
            <AppText variant="meta" style={{ color: brand.onHeroMuted }} numberOfLines={2}>
              {t('drawerTagline')}
            </AppText>
          </View>
        </View>

        <View style={styles.heading}>
          <AppText style={styles.title} accessibilityRole="header">
            {t('signInTitle')}
          </AppText>
          <AppText variant="body" tone="muted">
            {t('signInBody')}
          </AppText>
        </View>

        <Card style={styles.card} testID="sign-in-card">
          <EmailOtpForm onSignedIn={() => router.replace('/')} />
        </Card>

        <View style={styles.footer}>
          <Button label={t('signInSkip')} kind="secondary" onPress={skip} testID="sign-in-skip" />
          <AppText variant="meta" tone="muted" style={styles.center}>
            {t('signInSkipHint')}
          </AppText>
        </View>
      </KeyboardAwareScrollView>
      <StatusBarScrim />
    </View>
  );
}

const TILE = spacing.xl + spacing.xxs + spacing.sm;

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { flexGrow: 1, gap: spacing.lg },
  flex: { flex: 1, gap: 2 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md + spacing.xxs, borderRadius: radius.sheet, borderWidth: hairline },
  markTile: { width: TILE, height: TILE, borderRadius: radius.card, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: fontFamily.bold, fontSize: 17, letterSpacing: letterSpacing.wordmark },
  heading: { gap: spacing.xs },
  title: { ...text.headline, color: tc.ink },
  card: { padding: 0, overflow: 'hidden' },
  footer: { gap: spacing.sm, marginTop: 'auto' },
  center: { textAlign: 'center' },
}));
